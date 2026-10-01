import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "../db/index.js";
import { facturasPropiedad, tiposFactura } from "../db/schema/facturasPropiedad.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { movimientos } from "../db/schema/finanzas.js";
import { tiposMovimiento } from "../db/schema/administracion.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Reparte un total en centavos según unos pesos, sin que la suma se mueva.
 *
 * Cada parte se redondea hacia abajo al centavo y lo que sobra —a lo sumo unos
 * centavos por parte— se entrega de a uno empezando por la de más peso. Así
 * los gastos por unidad suman exactamente lo pagado.
 */
export function repartir(total: number, pesos: number[]): number[] {
  const centavos = Math.round(total * 100);
  const suma = pesos.reduce((t, p) => t + p, 0);
  if (pesos.length === 0 || suma <= 0) return [];
  const partes = pesos.map((p) => Math.floor((centavos * p) / suma));
  let resto = centavos - partes.reduce((t, x) => t + x, 0);
  const orden = pesos.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p || a.i - b.i);
  for (let k = 0; resto > 0; k = (k + 1) % orden.length, resto--) partes[orden[k]!.i]! += 1;
  return partes.map((c) => c / 100);
}

/**
 * Deja el gasto de una factura como debe estar HOY: se borra el que hubiera y
 * se vuelve a generar si corresponde. Idempotente a propósito: se llama tras
 * registrar, pagar, editar y anular sin preguntarse qué cambió, y nunca
 * puede quedar un gasto de más ni uno de menos.
 *
 * Solo genera gasto una factura pagada cuyo responsable es el propietario:
 * si paga el inquilino, no es plata que salga del propietario. El gasto usa
 * el valor y la fecha del pago, no los de la factura. Si la factura es de
 * una edificación, se reparte entre las unidades del dueño de la edificación
 * como eligió al registrarla, con un movimiento padre por el total y uno por
 * unidad —los que cuentan en Mis Rendimientos—.
 */
export async function sincronizarGasto(db: Database | Tx, facturaId: number): Promise<void> {
  const [f] = await db
    .select({
      inmuebleId: facturasPropiedad.inmuebleId, edificacionId: facturasPropiedad.edificacionId,
      estado: facturasPropiedad.estado, responsable: facturasPropiedad.responsable,
      prorrateo: facturasPropiedad.prorrateo, periodo: facturasPropiedad.periodo,
      fechaPago: facturasPropiedad.fechaPago, valorPagado: facturasPropiedad.valorPagado,
      tipo: tiposFactura.nombre, tipoMovimientoId: tiposFactura.tipoMovimientoId,
    })
    .from(facturasPropiedad)
    .innerJoin(tiposFactura, eq(tiposFactura.id, facturasPropiedad.tipoFacturaId))
    .where(eq(facturasPropiedad.id, facturaId)).limit(1);
  if (!f) return;

  await db.transaction(async (tx) => {
    // Los hijos se van en cascada con el padre; se borra todo lo del origen.
    await tx.delete(movimientos).where(and(
      eq(movimientos.origenTipo, "factura_propiedad"), eq(movimientos.origenId, facturaId),
    ));

    if (f.estado !== "pagado" || f.responsable !== "propietario" || f.fechaPago === null || f.valorPagado === null) return;

    let conceptoId = f.tipoMovimientoId;
    if (conceptoId === null) {
      const [otro] = await tx.select({ id: tiposMovimiento.id }).from(tiposMovimiento)
        .where(eq(tiposMovimiento.codigo, "otro_egreso")).limit(1);
      conceptoId = otro?.id ?? null;
    }

    const total = Number(f.valorPagado);
    const fecha = new Date(f.fechaPago).toISOString().slice(0, 10);
    const nota = `Factura de ${f.tipo.toLowerCase()} · ${f.periodo}`;
    const comunes = {
      tipo: "egreso" as const, tipoMovimientoId: conceptoId, fecha,
      origenTipo: "factura_propiedad" as const, origenId: facturaId, nota,
    };

    if (f.inmuebleId !== null) {
      await tx.insert(movimientos).values({
        ...comunes, ambito: "unidad", inmuebleId: f.inmuebleId, monto: total.toFixed(2), prorrateo: "ninguno",
      });
      return;
    }

    await repartirEnEdificacion(tx, f.edificacionId!, f.prorrateo === "ninguno" ? "partes_iguales" : f.prorrateo, comunes, total);
  });
}

type Comunes = {
  tipo: "ingreso" | "egreso"; tipoMovimientoId: number | null; fecha: string;
  origenTipo: "factura_propiedad" | "manual"; origenId?: number; nota: string | null;
  proveedor?: string | null; proveedorId?: number | null;
};

/**
 * Anota un movimiento de una edificación: uno padre por el total y uno por
 * cada unidad del dueño de la edificación, repartido como se pida. Los hijos
 * son los que cuentan en Mis Rendimientos. Lo usan el gasto que nace de una
 * factura y el gasto que se anota a mano sobre la edificación.
 */
/** Las unidades de la edificación (las del dueño, si tiene uno fijo) con el
 *  peso que les toca según el reparto elegido, validado. */
async function unidadesConPeso(
  tx: Tx, edificacionId: number, reparto: "partes_iguales" | "por_area" | "por_canon",
) {
  const [ed] = await tx.select({ propietarioId: edificaciones.propietarioId }).from(edificaciones)
    .where(eq(edificaciones.id, edificacionId)).limit(1);
  const unidades = await tx
    .select({ id: inmuebles.id, complemento: inmuebles.complemento, area: inmuebles.areaConstruidaM2, canon: inmuebles.canonBase })
    .from(inmuebles)
    .where(ed?.propietarioId
      ? and(eq(inmuebles.edificacionId, edificacionId), eq(inmuebles.propietarioId, ed.propietarioId))
      : eq(inmuebles.edificacionId, edificacionId));
  if (unidades.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "La edificación no tiene unidades entre las que repartir el gasto" });
  }

  const pesos = unidades.map((u) =>
    reparto === "por_area" ? Number(u.area ?? 0) : reparto === "por_canon" ? Number(u.canon) : 1);
  if (pesos.some((p) => p <= 0)) {
    const sin = unidades.filter((_, i) => pesos[i]! <= 0).map((u) => u.complemento ?? `#${u.id}`);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `No se puede repartir ${reparto === "por_area" ? "por área" : "por canon"}: falta ${reparto === "por_area" ? "el área" : "el canon"} de ${sin.join(", ")}`,
    });
  }
  return { unidades, pesos };
}

/** Los hijos —uno por unidad, los que cuentan en Mis Rendimientos— del
 *  movimiento padre que ya existe con ese id. */
async function insertarHijos(
  tx: Tx, unidades: Array<{ id: number }>, pesos: number[], total: number,
  reparto: "partes_iguales" | "por_area" | "por_canon", comunes: Comunes, padreId: number,
): Promise<void> {
  const partes = repartir(total, pesos);
  await tx.insert(movimientos).values(unidades.map((u, i) => ({
    ...comunes, ambito: "unidad" as const, inmuebleId: u.id, movimientoPadreId: padreId,
    monto: partes[i]!.toFixed(2), prorrateo: reparto,
  })));
}

export async function repartirEnEdificacion(
  tx: Tx, edificacionId: number, reparto: "partes_iguales" | "por_area" | "por_canon",
  comunes: Comunes, total: number,
): Promise<void> {
  const { unidades, pesos } = await unidadesConPeso(tx, edificacionId, reparto);
  const [padre] = await tx.insert(movimientos).values({
    ...comunes, ambito: "edificacion", edificacionId: edificacionId, monto: total.toFixed(2), prorrateo: reparto,
  });
  const padreId = Number((padre as { insertId: number }).insertId);
  await insertarHijos(tx, unidades, pesos, total, reparto, comunes, padreId);
}

/**
 * Vuelve a repartir un gasto de edificación que ya existe: se borran sus
 * hijos de antes y se ponen de nuevo, con el monto o el reparto que haya
 * cambiado. El padre conserva su id, así que nada que apunte a él se rompe.
 */
export async function reRepartirEnEdificacion(
  tx: Tx, edificacionId: number, reparto: "partes_iguales" | "por_area" | "por_canon",
  comunes: Comunes, total: number, padreId: number,
): Promise<void> {
  const { unidades, pesos } = await unidadesConPeso(tx, edificacionId, reparto);
  await tx.delete(movimientos).where(eq(movimientos.movimientoPadreId, padreId));
  await tx.update(movimientos).set({
    ...comunes, ambito: "edificacion", edificacionId, monto: total.toFixed(2), prorrateo: reparto,
  }).where(eq(movimientos.id, padreId));
  await insertarHijos(tx, unidades, pesos, total, reparto, comunes, padreId);
}
