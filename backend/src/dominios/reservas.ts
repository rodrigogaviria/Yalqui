import { z } from "zod";
import { and, asc, desc, eq, inArray, lt, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, exigirRol } from "../trpc/base.js";
import { inmuebles } from "../db/schema/inventario.js";
import { usuarios } from "../db/schema/identidad.js";
import { areasComunes, reservas } from "../db/schema/reservas.js";

const soloId = z.object({ inmuebleId: z.number().int().positive() });
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida");

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

/**
 * Lo que se puede reservar en una unidad, y quién pidió qué.
 *
 * Configurar áreas comunes y decidir sus reservas son las dos caras de lo
 * mismo que ya administra el propietario sobre su unidad — el mismo ámbito
 * de `configuracionRouter`, no uno nuevo. El día que un administrador de
 * copropiedad tenga su propio rol sobre la edificación, esto se reparte; hoy
 * el propietario es quien manda sobre todo lo suyo.
 */
export const reservasRouter = router({
  /** El catálogo de la unidad, activas e inactivas: para configurarlo hace
   *  falta ver también lo que se apagó. */
  areasComunes: delPropietario.input(soloId).query(({ ctx, input }) =>
    ctx.db
      .select({
        id: areasComunes.id,
        nombre: areasComunes.nombre,
        descripcion: areasComunes.descripcion,
        capacidad: areasComunes.capacidad,
        activa: areasComunes.activa,
      })
      .from(areasComunes)
      .where(eq(areasComunes.inmuebleId, input.inmuebleId))
      .orderBy(asc(areasComunes.nombre)),
  ),

  /** Solo lo activo: es el combo que ve quien va a reservar. Si viene vacío,
   *  la unidad no tiene nada que reservar todavía. */
  disponibles: delPropietario.input(soloId).query(({ ctx, input }) =>
    ctx.db
      .select({ id: areasComunes.id, nombre: areasComunes.nombre, capacidad: areasComunes.capacidad })
      .from(areasComunes)
      .where(and(eq(areasComunes.inmuebleId, input.inmuebleId), eq(areasComunes.activa, true)))
      .orderBy(asc(areasComunes.nombre)),
  ),

  crearAreaComun: delPropietario
    .input(soloId.extend({
      nombre: z.string().trim().min(2).max(120),
      descripcion: z.string().trim().max(255).optional(),
      capacidad: z.number().int().min(1).max(9999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(areasComunes).values({
        inmuebleId: input.inmuebleId,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        capacidad: input.capacidad ?? null,
        creadaPorId: ctx.usuario.id,
      });
      return { ok: true };
    }),

  /** Prende o apaga un área. Apagarla no borra sus reservas ya hechas, solo
   *  la saca del combo para las nuevas. */
  activarAreaComun: delPropietario
    .input(soloId.extend({ areaComunId: z.number().int().positive(), activa: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [a] = await ctx.db
        .select({ inmuebleId: areasComunes.inmuebleId })
        .from(areasComunes)
        .where(eq(areasComunes.id, input.areaComunId))
        .limit(1);

      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Esa área no existe" });
      if (a.inmuebleId !== input.inmuebleId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa área no es de esta unidad" });
      }

      await ctx.db.update(areasComunes).set({ activa: input.activa }).where(eq(areasComunes.id, input.areaComunId));
      return { ok: true };
    }),

  /** Las reservas de la unidad, con el nombre del área ya resuelto. */
  mias: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const filas = await ctx.db
      .select({
        id: reservas.id,
        areaComunId: reservas.areaComunId,
        area: areasComunes.nombre,
        solicitante: reservas.solicitante,
        fecha: reservas.fecha,
        horaInicio: reservas.horaInicio,
        horaFin: reservas.horaFin,
        estado: reservas.estado,
        createdAt: reservas.createdAt,
      })
      .from(reservas)
      .innerJoin(areasComunes, eq(areasComunes.id, reservas.areaComunId))
      .where(eq(areasComunes.inmuebleId, input.inmuebleId))
      .orderBy(desc(reservas.fecha), desc(reservas.horaInicio));

    return {
      reservas: filas,
      pendientes: filas.filter((r) => r.estado === "pendiente").length,
    };
  }),

  /**
   * Pide una reserva. Nace `pendiente`: aprobarla es otro paso.
   *
   * No se admite un horario que se cruce con otra reserva del mismo recurso
   * que siga viva (pendiente o aprobada) — una rechazada o cancelada ya no
   * ocupa el turno.
   */
  solicitar: delPropietario
    .input(soloId.extend({
      areaComunId: z.number().int().positive(),
      solicitante: z.string().trim().min(2).max(191).optional(),
      fecha: z.coerce.date(),
      horaInicio: hora,
      horaFin: hora,
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.horaFin <= input.horaInicio) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La hora de fin debe ser después de la de inicio" });
      }

      const [a] = await ctx.db
        .select({ inmuebleId: areasComunes.inmuebleId, activa: areasComunes.activa, nombre: areasComunes.nombre })
        .from(areasComunes)
        .where(eq(areasComunes.id, input.areaComunId))
        .limit(1);

      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Esa área no existe" });
      if (a.inmuebleId !== input.inmuebleId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa área no es de esta unidad" });
      }
      if (!a.activa) throw new TRPCError({ code: "CONFLICT", message: `${a.nombre} no está disponible ahora` });

      const cruces = await ctx.db
        .select({ id: reservas.id })
        .from(reservas)
        .where(and(
          eq(reservas.areaComunId, input.areaComunId),
          eq(reservas.fecha, input.fecha),
          inArray(reservas.estado, ["pendiente", "aprobada"]),
          lt(reservas.horaInicio, input.horaFin),
          gt(reservas.horaFin, input.horaInicio),
        ))
        .limit(1);

      if (cruces.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya hay una reserva de esa área en ese horario" });
      }

      let solicitante = input.solicitante;
      if (solicitante === undefined) {
        const [yo] = await ctx.db
          .select({ nombre: usuarios.nombre, apellido: usuarios.apellido })
          .from(usuarios)
          .where(eq(usuarios.id, ctx.usuario.id))
          .limit(1);
        solicitante = yo ? `${yo.nombre} ${yo.apellido}` : "Sin nombre";
      }

      await ctx.db.insert(reservas).values({
        areaComunId: input.areaComunId,
        solicitanteId: ctx.usuario.id,
        solicitante,
        fecha: input.fecha,
        horaInicio: input.horaInicio,
        horaFin: input.horaFin,
        estado: "pendiente",
      });

      return { ok: true };
    }),

  /** Aprueba o rechaza una reserva pendiente. */
  decidir: delPropietario
    .input(soloId.extend({
      reservaId: z.number().int().positive(),
      estado: z.enum(["aprobada", "rechazada"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db
        .select({ inmuebleId: areasComunes.inmuebleId, estado: reservas.estado })
        .from(reservas)
        .innerJoin(areasComunes, eq(areasComunes.id, reservas.areaComunId))
        .where(eq(reservas.id, input.reservaId))
        .limit(1);

      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Esa reserva no existe" });
      if (r.inmuebleId !== input.inmuebleId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa reserva no es de esta unidad" });
      }
      if (r.estado !== "pendiente") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa reserva ya fue decidida" });
      }

      await ctx.db.update(reservas).set({
        estado: input.estado,
        decididaPorId: ctx.usuario.id,
        decididaAt: new Date(),
      }).where(eq(reservas.id, input.reservaId));

      return { estado: input.estado };
    }),

  /** Quien la pidió se arrepiente, antes de que se decida o aunque ya esté
   *  aprobada: un plan cambia y el turno debe quedar libre para otro. */
  cancelar: delPropietario
    .input(soloId.extend({ reservaId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db
        .select({ inmuebleId: areasComunes.inmuebleId, estado: reservas.estado })
        .from(reservas)
        .innerJoin(areasComunes, eq(areasComunes.id, reservas.areaComunId))
        .where(eq(reservas.id, input.reservaId))
        .limit(1);

      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Esa reserva no existe" });
      if (r.inmuebleId !== input.inmuebleId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa reserva no es de esta unidad" });
      }
      if (r.estado !== "pendiente" && r.estado !== "aprobada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa reserva ya no está activa" });
      }

      await ctx.db.update(reservas).set({ estado: "cancelada" }).where(eq(reservas.id, input.reservaId));
      return { ok: true };
    }),
});
