import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publico, privado, exigirRol } from "../trpc/base.js";
import { visitas } from "../db/schema/demanda.js";
import { inmuebles } from "../db/schema/inventario.js";
import { ambitosCon } from "../auth/roles.js";

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

export const visitasRouter = router({
  /**
   * Agenda una visita. Público a propósito: el interesado todavía no tiene
   * cuenta, y exigirle registro antes de ver el inmueble es la forma más
   * rápida de perderlo.
   */
  agendar: publico
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      nombreContacto: z.string().trim().min(2).max(191),
      telefonoContacto: z.string().trim().min(7).max(30),
      emailContacto: z.string().trim().toLowerCase().email().max(191).optional(),
      inicioAt: z.coerce.date(),
      modalidad: z.enum(["presencial", "virtual"]).default("presencial"),
      notas: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.inicioAt.getTime() < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esa fecha ya pasó" });
      }

      const [u] = await ctx.db
        .select({ estado: inmuebles.estado })
        .from(inmuebles)
        .where(eq(inmuebles.id, input.inmuebleId))
        .limit(1);

      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });
      if (u.estado !== "publicado") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa unidad no está disponible" });
      }

      const [res] = await ctx.db.insert(visitas).values({
        inmuebleId: input.inmuebleId,
        interesadoId: ctx.usuario?.id ?? null,
        nombreContacto: input.nombreContacto,
        telefonoContacto: input.telefonoContacto,
        emailContacto: input.emailContacto ?? null,
        inicioAt: input.inicioAt,
        finAt: new Date(input.inicioAt.getTime() + 30 * 60_000),
        modalidad: input.modalidad,
        estado: "solicitada",
        notas: input.notas ?? null,
      });

      return { visitaId: Number((res as { insertId: number }).insertId), estado: "solicitada" as const };
    }),

  /** Las visitas de una unidad propia, de hoy en adelante. */
  deUnidad: delPropietario
    .input(z.object({ inmuebleId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const filas = await ctx.db
        .select()
        .from(visitas)
        .where(eq(visitas.inmuebleId, input.inmuebleId))
        .orderBy(desc(visitas.inicioAt));
      return { total: filas.length, visitas: filas };
    }),

  /** La agenda del propietario: lo que viene, en todas sus unidades. */
  agenda: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (ids.length === 0) return { total: 0, visitas: [] };

    const filas = await ctx.db
      .select({
        id: visitas.id,
        inmuebleId: visitas.inmuebleId,
        direccion: inmuebles.direccion,
        nombreContacto: visitas.nombreContacto,
        telefonoContacto: visitas.telefonoContacto,
        inicioAt: visitas.inicioAt,
        modalidad: visitas.modalidad,
        estado: visitas.estado,
      })
      .from(visitas)
      .innerJoin(inmuebles, eq(inmuebles.id, visitas.inmuebleId))
      .where(and(gte(visitas.inicioAt, new Date()), eq(visitas.estado, "confirmada")))
      .orderBy(visitas.inicioAt);

    return { total: filas.length, visitas: filas.filter((v) => ids.includes(v.inmuebleId)) };
  }),

  /**
   * Cierra la visita. `realizada` es la que habilita mandar la precalificación:
   * no tiene sentido precalificar a quien no vio el inmueble.
   */
  marcar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      visitaId: z.number().int().positive(),
      estado: z.enum(["confirmada", "realizada", "cancelada", "no_asistio"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [v] = await ctx.db
        .select({ id: visitas.id })
        .from(visitas)
        .where(and(eq(visitas.id, input.visitaId), eq(visitas.inmuebleId, input.inmuebleId)))
        .limit(1);

      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Esa visita no es de esta unidad" });

      await ctx.db.update(visitas).set({ estado: input.estado }).where(eq(visitas.id, input.visitaId));
      return { estado: input.estado };
    }),
});
