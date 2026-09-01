import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado, exigirRol } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { movimientos } from "../db/schema/finanzas.js";
import { inmuebles } from "../db/schema/inventario.js";
import { tiposMovimiento } from "../db/schema/administracion.js";

const dinero = z.number().min(0).max(999_999_999);
const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

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
  registrar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      tipoMovimientoId: z.number().int().positive(),
      monto: dinero,
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD"),
      nota: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [tipo] = await ctx.db
        .select({ tipo: tiposMovimiento.tipo, activo: tiposMovimiento.activo })
        .from(tiposMovimiento)
        .where(eq(tiposMovimiento.id, input.tipoMovimientoId))
        .limit(1);

      if (!tipo) throw new TRPCError({ code: "NOT_FOUND", message: "Ese concepto no existe" });
      if (!tipo.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese concepto está anulado" });

      const [res] = await ctx.db.insert(movimientos).values({
        ambito: "unidad",
        inmuebleId: input.inmuebleId,
        // El signo lo da el concepto, no quien registra: si el monto pudiera ser
        // negativo, un mismo gasto entraría a veces como egreso y a veces como
        // ingreso en negativo, y los totales dejarían de cuadrar.
        tipo: tipo.tipo,
        tipoMovimientoId: input.tipoMovimientoId,
        monto: input.monto.toFixed(2),
        fecha: input.fecha,
        origenTipo: "manual",
        nota: input.nota ?? null,
      });

      return { movimientoId: Number((res as { insertId: number }).insertId) };
    }),
});
