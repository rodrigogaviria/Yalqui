import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado, exigirRol } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { planes, suscripciones } from "../db/schema/dinero.js";
import { servicios, serviciosContratados } from "../db/schema/negocio.js";
import { inmuebles } from "../db/schema/inventario.js";

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

/**
 * Lo que el propietario le paga a Yalqui.
 *
 * Es el otro flujo de dinero, el que no se mezcla nunca con el arriendo: acá
 * el propietario es el que paga y Yalqui el que cobra. La suscripción va por
 * inmueble, no por cuenta, porque es cada unidad la que usa el servicio.
 */
export const planRouter = router({
  /** Los planes que se pueden contratar, con su precio vigente. */
  disponibles: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: planes.id,
        codigo: planes.codigo,
        nombre: planes.nombre,
        descripcion: planes.descripcion,
        precioMes: planes.precioMes,
      })
      .from(planes)
      .where(eq(planes.activo, true))
      .orderBy(planes.orden),
  ),

  /** Los servicios a la carta, disponibles también en el plan gratuito. */
  servicios: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: servicios.id,
        codigo: servicios.codigo,
        nombre: servicios.nombre,
        descripcion: servicios.descripcion,
        modeloCobro: servicios.modeloCobro,
        precioBase: servicios.precioBase,
        porcentaje: servicios.porcentaje,
        requiereContrato: servicios.requiereContrato,
      })
      .from(servicios)
      .where(eq(servicios.activo, true))
      .orderBy(servicios.nombre),
  ),

  /**
   * Qué tiene contratado cada unidad.
   *
   * Una unidad sin fila de suscripción está en Básico: el plan gratuito no se
   * contrata, es lo que hay cuando no se contrató nada. Crearle una fila a cada
   * unidad solo para decir que no paga sería inventar una suscripción.
   */
  mio: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (ids.length === 0) return { unidades: [], totalMes: 0 };

    const unidades = await ctx.db
      .select({
        inmuebleId: inmuebles.id,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        estado: inmuebles.estado,
      })
      .from(inmuebles)
      .where(inArray(inmuebles.id, ids));

    const subs = await ctx.db
      .select({
        inmuebleId: suscripciones.inmuebleId,
        estado: suscripciones.estado,
        ciclo: suscripciones.ciclo,
        precioCongelado: suscripciones.precioCongelado,
        proximaFacturacionAt: suscripciones.proximaFacturacionAt,
        plan: planes.nombre,
        planCodigo: planes.codigo,
      })
      .from(suscripciones)
      .innerJoin(planes, eq(planes.id, suscripciones.planId))
      .where(and(inArray(suscripciones.inmuebleId, ids), eq(suscripciones.estado, "activa")));

    const contratados = await ctx.db
      .select({
        id: serviciosContratados.id,
        inmuebleId: serviciosContratados.inmuebleId,
        estado: serviciosContratados.estado,
        precioAcordado: serviciosContratados.precioAcordado,
        servicio: servicios.nombre,
        modeloCobro: servicios.modeloCobro,
      })
      .from(serviciosContratados)
      .innerJoin(servicios, eq(servicios.id, serviciosContratados.servicioId))
      .where(inArray(serviciosContratados.inmuebleId, ids))
      .orderBy(desc(serviciosContratados.solicitadoAt));

    const filas = unidades.map((u) => {
      const sub = subs.find((s) => s.inmuebleId === u.inmuebleId) ?? null;
      const suyos = contratados.filter(
        (c) => c.inmuebleId === u.inmuebleId && c.estado === "activo",
      );
      // Solo lo recurrente entra en el mes. Un servicio de pago único ya se
      // cobró: sumarlo cada mes inflaría el costo fijo.
      const recurrentes = suyos
        .filter((c) => c.modeloCobro === "recurrente")
        .reduce((t, c) => t + Number(c.precioAcordado ?? 0), 0);

      return {
        ...u,
        plan: sub?.plan ?? "Básico",
        planCodigo: sub?.planCodigo ?? "basico",
        precioPlan: Number(sub?.precioCongelado ?? 0),
        proximaFacturacionAt: sub?.proximaFacturacionAt ?? null,
        servicios: suyos,
        totalMes: Number(sub?.precioCongelado ?? 0) + recurrentes,
      };
    });

    return { unidades: filas, totalMes: filas.reduce((t, u) => t + u.totalMes, 0) };
  }),

  /**
   * Contrata un servicio a la carta para una unidad.
   *
   * Queda solicitado, no activo: activarlo es una decisión de Yalqui, no del
   * propietario, y varios servicios exigen un contrato de arriendo vigente que
   * hay que comprobar antes.
   */
  contratarServicio: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      servicioId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [s] = await ctx.db
        .select({
          activo: servicios.activo,
          precioBase: servicios.precioBase,
          modeloCobro: servicios.modeloCobro,
          nombre: servicios.nombre,
        })
        .from(servicios)
        .where(eq(servicios.id, input.servicioId))
        .limit(1);

      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Ese servicio no existe" });
      if (!s.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese servicio está anulado" });

      const [ya] = await ctx.db
        .select({ id: serviciosContratados.id })
        .from(serviciosContratados)
        .where(and(
          eq(serviciosContratados.inmuebleId, input.inmuebleId),
          eq(serviciosContratados.servicioId, input.servicioId),
          inArray(serviciosContratados.estado, ["solicitado", "activo"]),
        ))
        .limit(1);

      if (ya) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${s.nombre} ya está contratado para esta unidad`,
        });
      }

      // El precio se congela al contratar: si Yalqui repreciara el servicio, el
      // que ya lo tomó sigue con el que aceptó.
      //
      // Un servicio cobrado por porcentaje no tiene precio fijo — depende del
      // canon del mes— así que se guarda en cero y el monto se resuelve al
      // facturar. Cero acá significa «se calcula», no «es gratis».
      const [res] = await ctx.db.insert(serviciosContratados).values({
        propietarioId: ctx.usuario.id,
        servicioId: input.servicioId,
        inmuebleId: input.inmuebleId,
        estado: "solicitado",
        precioAcordado: s.precioBase ?? "0.00",
      });

      return { id: Number((res as { insertId: number }).insertId), estado: "solicitado" as const };
    }),
});
