import { z } from "zod";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { ambitosCon, tieneRol } from "../auth/roles.js";
import { puedeSobreEdificacion } from "./facturasPropiedad.js";
import { repartirEnEdificacion } from "./gastoDeFactura.js";
import { movimientos } from "../db/schema/finanzas.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { tiposMovimiento } from "../db/schema/administracion.js";

const dinero = z.number().min(0).max(999_999_999);
/** Un mes en formato AAAA-MM, como lo escribe el selector del navegador. */
const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Usá el formato AAAA-MM");

export const rentabilidadRouter = router({
  /** Los conceptos con los que se puede clasificar un movimiento. */
  tipos: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: tiposMovimiento.id,
        nombre: tiposMovimiento.nombre,
        tipo: tiposMovimiento.tipo,
        deducible: tiposMovimiento.deducible,
        ambito: tiposMovimiento.ambito,
      })
      .from(tiposMovimiento)
      .where(eq(tiposMovimiento.activo, true))
      .orderBy(tiposMovimiento.tipo, tiposMovimiento.orden),
  ),

  /**
   * Los gastos tal como se anotaron: uno por gasto. Uno sobre la edificación
   * sale una sola vez, con su total, y no una vez por cada unidad entre las
   * que se reparte —esas partes viven en el resumen, que es lo que suma Mis
   * Rendimientos—.
   */
  gastos: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    const eds = [
      ...ambitosCon(ctx.usuario.roles, "propietario", "edificacion"),
      ...ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion"),
    ];
    if (ids.length === 0 && eds.length === 0) return [];
    const filas = await ctx.db
      .select({
        id: movimientos.id,
        monto: movimientos.monto,
        fecha: movimientos.fecha,
        nota: movimientos.nota,
        origenTipo: movimientos.origenTipo,
        prorrateo: movimientos.prorrateo,
        edificacion: edificaciones.nombre,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        concepto: tiposMovimiento.nombre,
      })
      .from(movimientos)
      .leftJoin(inmuebles, eq(inmuebles.id, movimientos.inmuebleId))
      .leftJoin(edificaciones, eq(edificaciones.id, movimientos.edificacionId))
      .leftJoin(tiposMovimiento, eq(tiposMovimiento.id, movimientos.tipoMovimientoId))
      .where(and(
        eq(movimientos.tipo, "egreso"),
        or(
          ...(ids.length > 0 ? [and(inArray(movimientos.inmuebleId, ids), isNull(movimientos.movimientoPadreId))] : []),
          ...(eds.length > 0 ? [inArray(movimientos.edificacionId, eds)] : []),
        ),
      ))
      .orderBy(desc(movimientos.fecha), desc(movimientos.id));

    // Las partes de cada gasto repartido: lo que le tocó a cada unidad.
    const padres = filas.filter((f) => f.edificacion !== null).map((f) => f.id);
    const partes = padres.length === 0 ? [] : await ctx.db
      .select({
        padreId: movimientos.movimientoPadreId, monto: movimientos.monto,
        direccion: inmuebles.direccion, complemento: inmuebles.complemento,
      })
      .from(movimientos)
      .innerJoin(inmuebles, eq(inmuebles.id, movimientos.inmuebleId))
      .where(inArray(movimientos.movimientoPadreId, padres))
      .orderBy(inmuebles.direccion, inmuebles.complemento);

    return filas.map((f) => ({
      ...f,
      partes: partes.filter((x) => x.padreId === f.id)
        .map((x) => ({ unidad: `${x.direccion}${x.complemento ? `, ${x.complemento}` : ""}`, monto: x.monto })),
    }));
  }),

  /**
   * Ingresos y egresos del propietario, con el resultado del período.
   *
   * El neto es ingresos menos egresos sin más: no descuenta impuestos ni
   * amortizaciones. Es caja, no contabilidad — decir «rentabilidad» de otra
   * forma exigiría datos que el sistema no tiene.
   */
  resumen: privado
    .input(z.object({ desde: periodo.optional(), hasta: periodo.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
      if (ids.length === 0) {
        return { movimientos: [], ingresos: 0, egresos: 0, neto: 0, porUnidad: [], porConcepto: [] };
      }

      const filas = await ctx.db
        .select({
          id: movimientos.id,
          tipo: movimientos.tipo,
          monto: movimientos.monto,
          fecha: movimientos.fecha,
          nota: movimientos.nota,
          origenTipo: movimientos.origenTipo,
          reparto: movimientos.movimientoPadreId,
          inmuebleId: inmuebles.id,
          direccion: inmuebles.direccion,
          complemento: inmuebles.complemento,
          concepto: tiposMovimiento.nombre,
          deducible: tiposMovimiento.deducible,
        })
        .from(movimientos)
        .innerJoin(inmuebles, eq(inmuebles.id, movimientos.inmuebleId))
        .leftJoin(tiposMovimiento, eq(tiposMovimiento.id, movimientos.tipoMovimientoId))
        .where(inArray(movimientos.inmuebleId, ids))
        .orderBy(desc(movimientos.fecha));

      // El rango se filtra acá y no en SQL porque `fecha` es DATE y el período
      // llega como AAAA-MM: comparar los siete primeros caracteres es más claro
      // que construir el primer y último día del mes en la consulta.
      const dentro = filas.filter((m) => {
        const mes = String(m.fecha).slice(0, 7);
        if (input.desde !== undefined && mes < input.desde) return false;
        if (input.hasta !== undefined && mes > input.hasta) return false;
        return true;
      });

      const suma = (t: "ingreso" | "egreso") =>
        dentro.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.monto), 0);

      const ingresos = suma("ingreso");
      const egresos = suma("egreso");

      const agrupar = <T extends string | number>(
        clave: (m: (typeof dentro)[number]) => T,
        titulo: (m: (typeof dentro)[number]) => string,
      ) => {
        const mapa = new Map<T, { titulo: string; ingresos: number; egresos: number }>();
        for (const m of dentro) {
          const k = clave(m);
          const actual = mapa.get(k) ?? { titulo: titulo(m), ingresos: 0, egresos: 0 };
          if (m.tipo === "ingreso") actual.ingresos += Number(m.monto);
          else actual.egresos += Number(m.monto);
          mapa.set(k, actual);
        }
        return [...mapa.entries()].map(([k, v]) => ({ clave: k, ...v, neto: v.ingresos - v.egresos }));
      };

      return {
        movimientos: dentro,
        ingresos,
        egresos,
        neto: ingresos - egresos,
        porUnidad: agrupar(
          (m) => m.inmuebleId,
          (m) => `${m.direccion}${m.complemento ? `, ${m.complemento}` : ""}`,
        ).sort((a, b) => b.neto - a.neto),
        porConcepto: agrupar((m) => m.concepto ?? "Sin clasificar", (m) => m.concepto ?? "Sin clasificar")
          .sort((a, b) => (b.ingresos + b.egresos) - (a.ingresos + a.egresos)),
      };
    }),

  /** Registra un ingreso o egreso a mano. */
  /**
   * Anota un movimiento a mano. Sobre una unidad, o sobre una edificación: en
   * ese caso se reparte entre sus unidades como elija quien lo registra.
   */
  registrar: privado
    .input(z.object({
      inmuebleId: z.number().int().positive().optional(),
      edificacionId: z.number().int().positive().optional(),
      prorrateo: z.enum(["partes_iguales", "por_area", "por_canon"]).optional(),
      tipoMovimientoId: z.number().int().positive(),
      monto: dinero,
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD"),
      nota: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((input.inmuebleId === undefined) === (input.edificacionId === undefined)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Decí si el gasto es de una unidad o de la edificación" });
      }
      const puede = input.inmuebleId !== undefined
        ? tieneRol(ctx.usuario.roles, "propietario", "inmueble", input.inmuebleId)
        : puedeSobreEdificacion(ctx.usuario.roles, input.edificacionId!);
      if (!puede) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
      if (input.edificacionId !== undefined && !input.prorrateo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Elegí cómo se reparte entre las unidades" });
      }
      if (input.monto <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "El monto debe ser mayor a cero" });

      const [tipo] = await ctx.db
        .select({ tipo: tiposMovimiento.tipo, activo: tiposMovimiento.activo })
        .from(tiposMovimiento)
        .where(eq(tiposMovimiento.id, input.tipoMovimientoId))
        .limit(1);

      if (!tipo) throw new TRPCError({ code: "NOT_FOUND", message: "Ese concepto no existe" });
      if (!tipo.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese concepto está anulado" });

      // El signo lo da el concepto, no quien registra: si el monto pudiera ser
      // negativo, un mismo gasto entraría a veces como egreso y a veces como
      // ingreso en negativo, y los totales dejarían de cuadrar.
      const comunes = {
        tipo: tipo.tipo, tipoMovimientoId: input.tipoMovimientoId, fecha: input.fecha,
        origenTipo: "manual" as const, nota: input.nota ?? null,
      };

      if (input.edificacionId !== undefined) {
        await ctx.db.transaction((tx) =>
          repartirEnEdificacion(tx, input.edificacionId!, input.prorrateo!, comunes, input.monto));
        return { movimientoId: null };
      }

      const [res] = await ctx.db.insert(movimientos).values({
        ...comunes, ambito: "unidad", inmuebleId: input.inmuebleId!, monto: input.monto.toFixed(2),
      });
      return { movimientoId: Number((res as { insertId: number }).insertId) };
    }),
});
