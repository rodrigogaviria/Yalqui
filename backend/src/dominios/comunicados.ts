import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado, exigirRol } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { comunicados } from "../db/schema/comunicacion.js";
import { inmuebles } from "../db/schema/inventario.js";

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

const TIPOS = ["aviso", "mantenimiento", "incremento_canon", "recordatorio",
               "emergencia", "normativo", "comercial"] as const;
const PRIORIDADES = ["baja", "normal", "alta", "urgente"] as const;

/**
 * Los avisos que el propietario le manda a sus inquilinos.
 *
 * Un comunicado se guarda como borrador y se envía aparte. Separar las dos
 * cosas es lo que permite escribir un aviso de aumento de canon, releerlo al
 * día siguiente y recién ahí mandarlo — enviar al guardar no deja arrepentirse.
 */
export const comunicadosRouter = router({
  mios: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (ids.length === 0) return { total: 0, comunicados: [] };

    const filas = await ctx.db
      .select({
        id: comunicados.id,
        titulo: comunicados.titulo,
        cuerpo: comunicados.cuerpo,
        tipo: comunicados.tipo,
        prioridad: comunicados.prioridad,
        estado: comunicados.estado,
        canales: comunicados.canales,
        enviadoAt: comunicados.enviadoAt,
        createdAt: comunicados.createdAt,
        inmuebleId: inmuebles.id,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
      })
      .from(comunicados)
      .innerJoin(inmuebles, eq(inmuebles.id, comunicados.inmuebleId))
      .where(inArray(comunicados.inmuebleId, ids))
      .orderBy(desc(comunicados.createdAt));

    return { total: filas.length, comunicados: filas };
  }),

  redactar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      titulo: z.string().trim().min(4).max(191),
      cuerpo: z.string().trim().min(10).max(8000),
      tipo: z.enum(TIPOS).default("aviso"),
      prioridad: z.enum(PRIORIDADES).default("normal"),
      /** Por dónde se manda. WhatsApp es el que de verdad se lee acá. */
      canales: z.array(z.enum(["app", "email", "whatsapp"])).min(1).default(["app"]),
      requiereConfirmacion: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const [res] = await ctx.db.insert(comunicados).values({
        autorId: ctx.usuario.id,
        // El ámbito de la tabla llama «unidad» a lo que el resto llama inmueble.
        ambito: "unidad",
        inmuebleId: input.inmuebleId,
        tipo: input.tipo,
        titulo: input.titulo,
        cuerpo: input.cuerpo,
        prioridad: input.prioridad,
        requiereConfirmacion: input.requiereConfirmacion,
        canales: input.canales,
        estado: "borrador",
      });
      return { comunicadoId: Number((res as { insertId: number }).insertId) };
    }),

  /**
   * Marca el comunicado como enviado.
   *
   * Hoy solo cambia el estado: el envío real por WhatsApp y correo necesita
   * salida a internet desde la Lambda, y la VPC está sin NAT. Queda registrado
   * para que el historial sea correcto cuando el envío exista.
   */
  enviar: privado
    .input(z.object({ comunicadoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await ctx.db
        .select({ inmuebleId: comunicados.inmuebleId, estado: comunicados.estado })
        .from(comunicados)
        .where(eq(comunicados.id, input.comunicadoId))
        .limit(1);

      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Ese comunicado no existe" });

      const mios = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
      if (c.inmuebleId === null || !mios.includes(c.inmuebleId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
      }
      if (c.estado === "enviado") {
        throw new TRPCError({ code: "CONFLICT", message: "Ese comunicado ya se envió" });
      }

      await ctx.db
        .update(comunicados)
        .set({ estado: "enviado", enviadoAt: new Date().toISOString().slice(0, 19).replace("T", " ") })
        .where(eq(comunicados.id, input.comunicadoId));

      return { estado: "enviado" as const };
    }),
});
