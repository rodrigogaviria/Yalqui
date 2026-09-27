import { z } from "zod";
import { and, asc, desc, eq, inArray, lt, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, exigirRol } from "../trpc/base.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { usuarios } from "../db/schema/identidad.js";
import { areasComunes, reservas } from "../db/schema/reservas.js";
import { tieneRol, type RolOtorgado } from "../auth/roles.js";
import type { Database } from "../db/index.js";

const soloId = z.object({ inmuebleId: z.number().int().positive() });
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida");

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

/**
 * A dónde pertenecen las áreas que ve una unidad: a su edificación, si
 * tiene una, o a ella misma, si es suelta. Todo se sigue pidiendo por
 * unidad y es el servidor quien resuelve a cuál de las dos corresponde.
 */
interface Sitio { edificacionId: number | null; edificacion: string | null }

async function sitioDe(db: Database, inmuebleId: number): Promise<Sitio> {
  const [u] = await db
    .select({ edificacionId: inmuebles.edificacionId, edificacion: edificaciones.nombre })
    .from(inmuebles)
    .leftJoin(edificaciones, eq(edificaciones.id, inmuebles.edificacionId))
    .where(eq(inmuebles.id, inmuebleId))
    .limit(1);
  return { edificacionId: u?.edificacionId ?? null, edificacion: u?.edificacion ?? null };
}

const dondeAreas = (s: Sitio, inmuebleId: number) =>
  s.edificacionId !== null ? eq(areasComunes.edificacionId, s.edificacionId) : eq(areasComunes.inmuebleId, inmuebleId);

/**
 * Quién configura las áreas y decide las reservas. En una edificación, su
 * dueño o su administrador —que no es lo mismo que ser dueño de una unidad
 * suya: un apartamento no manda sobre el salón del edificio—. En una unidad
 * suelta, su propietario, que ya pasó el guardia.
 */
function puedeAdministrar(roles: RolOtorgado[], s: Sitio): boolean {
  if (s.edificacionId === null) return true;
  return tieneRol(roles, "propietario", "edificacion", s.edificacionId)
    || tieneRol(roles, "administrador_inmueble", "edificacion", s.edificacionId);
}

function exigirAdministrar(roles: RolOtorgado[], s: Sitio) {
  if (!puedeAdministrar(roles, s)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Solo quien administra ${s.edificacion ?? "la edificación"} puede hacer esto`,
    });
  }
}

/** El área, si pertenece al sitio de esta unidad. */
async function areaDelSitio(db: Database, s: Sitio, inmuebleId: number, areaComunId: number) {
  const [a] = await db
    .select({
      id: areasComunes.id, inmuebleId: areasComunes.inmuebleId, edificacionId: areasComunes.edificacionId,
      activa: areasComunes.activa, nombre: areasComunes.nombre,
    })
    .from(areasComunes).where(eq(areasComunes.id, areaComunId)).limit(1);
  if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Esa área no existe" });
  const pertenece = s.edificacionId !== null ? a.edificacionId === s.edificacionId : a.inmuebleId === inmuebleId;
  if (!pertenece) throw new TRPCError({ code: "FORBIDDEN", message: "Esa área no es de esta unidad" });
  return a;
}

/**
 * Lo que se puede reservar y quién pidió qué.
 *
 * Las áreas son de la edificación cuando la unidad pertenece a una: el salón
 * social existe una sola vez para todo el edificio.
 */
export const reservasRouter = router({
  /** El catálogo, activas e inactivas: para configurarlo hace falta ver también lo que se apagó. */
  areasComunes: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const s = await sitioDe(ctx.db, input.inmuebleId);
    return ctx.db
      .select({
        id: areasComunes.id, nombre: areasComunes.nombre, descripcion: areasComunes.descripcion,
        capacidad: areasComunes.capacidad, activa: areasComunes.activa,
      })
      .from(areasComunes)
      .where(dondeAreas(s, input.inmuebleId))
      .orderBy(asc(areasComunes.nombre));
  }),

  /** Solo lo activo: es el combo que ve quien va a reservar. */
  disponibles: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const s = await sitioDe(ctx.db, input.inmuebleId);
    return ctx.db
      .select({ id: areasComunes.id, nombre: areasComunes.nombre, capacidad: areasComunes.capacidad })
      .from(areasComunes)
      .where(and(dondeAreas(s, input.inmuebleId), eq(areasComunes.activa, true)))
      .orderBy(asc(areasComunes.nombre));
  }),

  crearAreaComun: delPropietario
    .input(soloId.extend({
      nombre: z.string().trim().min(2).max(120),
      descripcion: z.string().trim().max(255).optional(),
      capacidad: z.number().int().min(1).max(9999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const s = await sitioDe(ctx.db, input.inmuebleId);
      exigirAdministrar(ctx.usuario.roles, s);
      await ctx.db.insert(areasComunes).values({
        inmuebleId: s.edificacionId === null ? input.inmuebleId : null,
        edificacionId: s.edificacionId,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        capacidad: input.capacidad ?? null,
        creadaPorId: ctx.usuario.id,
      });
      return { ok: true };
    }),

  /** Prende o apaga un área. Apagarla no borra sus reservas ya hechas, solo la saca del combo. */
  activarAreaComun: delPropietario
    .input(soloId.extend({ areaComunId: z.number().int().positive(), activa: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const s = await sitioDe(ctx.db, input.inmuebleId);
      exigirAdministrar(ctx.usuario.roles, s);
      await areaDelSitio(ctx.db, s, input.inmuebleId, input.areaComunId);
      await ctx.db.update(areasComunes).set({ activa: input.activa }).where(eq(areasComunes.id, input.areaComunId));
      return { ok: true };
    }),

  /**
   * Las reservas del sitio. Quien administra la edificación las ve todas;
   * el dueño de una unidad, solo las suyas: que un vecino vea a qué hora
   * reservó otro no es asunto suyo.
   */
  mias: delPropietario.input(soloId).query(async ({ ctx, input }) => {
    const s = await sitioDe(ctx.db, input.inmuebleId);
    const administra = puedeAdministrar(ctx.usuario.roles, s);
    const filas = await ctx.db
      .select({
        id: reservas.id, areaComunId: reservas.areaComunId, area: areasComunes.nombre,
        solicitante: reservas.solicitante, solicitanteId: reservas.solicitanteId,
        fecha: reservas.fecha, horaInicio: reservas.horaInicio, horaFin: reservas.horaFin,
        estado: reservas.estado, createdAt: reservas.createdAt,
      })
      .from(reservas)
      .innerJoin(areasComunes, eq(areasComunes.id, reservas.areaComunId))
      .where(administra
        ? dondeAreas(s, input.inmuebleId)
        : and(dondeAreas(s, input.inmuebleId), eq(reservas.solicitanteId, ctx.usuario.id)))
      .orderBy(desc(reservas.fecha), desc(reservas.horaInicio));

    return {
      reservas: filas.map(({ solicitanteId, ...r }) => ({ ...r, esMia: solicitanteId === ctx.usuario.id })),
      pendientes: filas.filter((r) => r.estado === "pendiente").length,
      edificacion: s.edificacion,
      puedeAdministrar: administra,
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
      const s = await sitioDe(ctx.db, input.inmuebleId);
      const a = await areaDelSitio(ctx.db, s, input.inmuebleId, input.areaComunId);
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
          .from(usuarios).where(eq(usuarios.id, ctx.usuario.id)).limit(1);
        solicitante = yo ? `${yo.nombre} ${yo.apellido}` : "Sin nombre";
      }

      await ctx.db.insert(reservas).values({
        areaComunId: input.areaComunId, solicitanteId: ctx.usuario.id, solicitante,
        fecha: input.fecha, horaInicio: input.horaInicio, horaFin: input.horaFin, estado: "pendiente",
      });
      return { ok: true };
    }),

  /** Aprueba o rechaza una reserva pendiente. Solo quien administra el sitio. */
  decidir: delPropietario
    .input(soloId.extend({
      reservaId: z.number().int().positive(),
      estado: z.enum(["aprobada", "rechazada"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const s = await sitioDe(ctx.db, input.inmuebleId);
      exigirAdministrar(ctx.usuario.roles, s);
      const r = await reservaDelSitio(ctx.db, s, input.inmuebleId, input.reservaId);
      if (r.estado !== "pendiente") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa reserva ya fue decidida" });
      }
      await ctx.db.update(reservas).set({
        estado: input.estado, decididaPorId: ctx.usuario.id, decididaAt: new Date(),
      }).where(eq(reservas.id, input.reservaId));
      return { estado: input.estado };
    }),

  /** Quien la pidió se arrepiente, o quien administra libera el turno. */
  cancelar: delPropietario
    .input(soloId.extend({ reservaId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const s = await sitioDe(ctx.db, input.inmuebleId);
      const r = await reservaDelSitio(ctx.db, s, input.inmuebleId, input.reservaId);
      if (!puedeAdministrar(ctx.usuario.roles, s) && r.solicitanteId !== ctx.usuario.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo podés cancelar tus reservas" });
      }
      if (r.estado !== "pendiente" && r.estado !== "aprobada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa reserva ya no está activa" });
      }
      await ctx.db.update(reservas).set({ estado: "cancelada" }).where(eq(reservas.id, input.reservaId));
      return { ok: true };
    }),
});

async function reservaDelSitio(db: Database, s: Sitio, inmuebleId: number, reservaId: number) {
  const [r] = await db
    .select({
      estado: reservas.estado, solicitanteId: reservas.solicitanteId,
      areaInmuebleId: areasComunes.inmuebleId, areaEdificacionId: areasComunes.edificacionId,
    })
    .from(reservas)
    .innerJoin(areasComunes, eq(areasComunes.id, reservas.areaComunId))
    .where(eq(reservas.id, reservaId))
    .limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Esa reserva no existe" });
  const pertenece = s.edificacionId !== null ? r.areaEdificacionId === s.edificacionId : r.areaInmuebleId === inmuebleId;
  if (!pertenece) throw new TRPCError({ code: "FORBIDDEN", message: "Esa reserva no es de esta unidad" });
  return r;
}
