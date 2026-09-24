import { z } from "zod";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { comunicados, comunicadoUnidades } from "../db/schema/comunicacion.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";

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
    const idsEdificacion = [
      ...ambitosCon(ctx.usuario.roles, "propietario", "edificacion"),
      ...ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion"),
    ];
    if (ids.length === 0 && idsEdificacion.length === 0) return { total: 0, comunicados: [] };

    // Los que llegan a alguna de mis unidades, por la tabla de alcance.
    const deMisUnidades = ids.length === 0 ? [] : await ctx.db
      .selectDistinct({ id: comunicadoUnidades.comunicadoId })
      .from(comunicadoUnidades)
      .where(inArray(comunicadoUnidades.inmuebleId, ids));

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
        ambito: comunicados.ambito,
        edificacionId: edificaciones.id,
        edificacion: edificaciones.nombre,
      })
      .from(comunicados)
      // LEFT: uno dirigido a la edificación no tiene unidad, y con INNER
      // desaparecería justamente el que llega a más gente.
      .leftJoin(edificaciones, eq(edificaciones.id, comunicados.edificacionId))
      .where(or(
        ...(deMisUnidades.length > 0 ? [inArray(comunicados.id, deMisUnidades.map((x) => x.id))] : []),
        ...(idsEdificacion.length > 0 ? [inArray(comunicados.edificacionId, idsEdificacion)] : []),
      ))
      .orderBy(desc(comunicados.createdAt));

    const idsCom = filas.map((f) => f.id);
    const destinos = idsCom.length === 0 ? [] : await ctx.db
      .select({
        comunicadoId: comunicadoUnidades.comunicadoId,
        id: inmuebles.id, direccion: inmuebles.direccion, complemento: inmuebles.complemento,
      })
      .from(comunicadoUnidades)
      .innerJoin(inmuebles, eq(inmuebles.id, comunicadoUnidades.inmuebleId))
      .where(inArray(comunicadoUnidades.comunicadoId, idsCom))
      .orderBy(inmuebles.direccion, inmuebles.complemento);

    return {
      total: filas.length,
      comunicados: filas.map((f) => ({
        ...f,
        unidades: destinos
          .filter((d) => d.comunicadoId === f.id)
          .map((d) => ({ id: d.id, direccion: d.direccion, complemento: d.complemento })),
      })),
    };
  }),

  /**
   * Redacta un comunicado.
   *
   * Puede ir a una unidad o a toda una edificación. Son dos alcances distintos
   * y no una comodidad: «se corta el agua el jueves» le sirve a todo el
   * edificio, y mandarlo unidad por unidad obliga a escribirlo diez veces y
   * deja diez historiales donde debería haber uno.
   */
  redactar: privado
    .input(z.object({
      ambito: z.enum(["unidad", "edificacion"]).default("unidad"),
      inmuebleId: z.number().int().positive().optional(),
      /** Varias unidades a la vez: se guarda un comunicado por cada una. */
      inmuebleIds: z.array(z.number().int().positive()).min(1).max(200).optional(),
      edificacionId: z.number().int().positive().optional(),
      titulo: z.string().trim().min(4).max(191),
      cuerpo: z.string().trim().min(10).max(8000),
      tipo: z.enum(TIPOS).default("aviso"),
      prioridad: z.enum(PRIORIDADES).default("normal"),
      /** Por dónde se manda. WhatsApp es el que de verdad se lee acá. */
      canales: z.array(z.enum(["app", "email", "whatsapp"])).min(1).default(["app"]),
      requiereConfirmacion: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const destinos = [...new Set(input.inmuebleIds ?? (input.inmuebleId === undefined ? [] : [input.inmuebleId]))];
      if (input.ambito === "unidad" && destinos.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Decí a qué unidad va" });
      }
      if (input.ambito === "edificacion" && input.edificacionId === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Decí a qué edificación va" });
      }

      const mias = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
      const puede = input.ambito === "unidad"
        ? destinos.every((id) => mias.includes(id))
        : ambitosCon(ctx.usuario.roles, "propietario", "edificacion").includes(input.edificacionId!)
          || ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion").includes(input.edificacionId!);

      if (!puede) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
      }

      const [res] = await ctx.db.insert(comunicados).values({
        autorId: ctx.usuario.id,
        // El ámbito de la tabla llama «unidad» a lo que el resto llama inmueble.
        ambito: input.ambito === "unidad" ? "unidad" : "edificacion",
        // Un solo destino lo deja también en la columna; varios, solo en la
        // tabla de alcance: un comunicado, una fila.
        inmuebleId: input.ambito === "unidad" && destinos.length === 1 ? destinos[0]! : null,
        edificacionId: input.ambito === "edificacion" ? input.edificacionId ?? null : null,
        tipo: input.tipo,
        titulo: input.titulo,
        cuerpo: input.cuerpo,
        prioridad: input.prioridad,
        requiereConfirmacion: input.requiereConfirmacion,
        canales: input.canales,
        estado: "borrador",
      });
      const comunicadoId = Number((res as { insertId: number }).insertId);

      if (input.ambito === "unidad") {
        await ctx.db.insert(comunicadoUnidades)
          .values(destinos.map((inmuebleId) => ({ comunicadoId, inmuebleId })));
      }
      return { comunicadoId, unidades: destinos.length };
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
      const c = await comunicadoPropio(ctx, input.comunicadoId);
      if (c.estado === "enviado") {
        throw new TRPCError({ code: "CONFLICT", message: "Ese comunicado ya se envió" });
      }
      if (c.estado === "cancelado") {
        throw new TRPCError({ code: "CONFLICT", message: "Ese comunicado se descartó" });
      }

      await ctx.db
        .update(comunicados)
        .set({ estado: "enviado", enviadoAt: new Date().toISOString().slice(0, 19).replace("T", " ") })
        .where(eq(comunicados.id, input.comunicadoId));

      return { estado: "enviado" as const };
    }),

  /** Descarta un borrador que no se va a mandar. Uno ya enviado no se toca: es historial. */
  descartar: privado
    .input(z.object({ comunicadoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const c = await comunicadoPropio(ctx, input.comunicadoId);
      if (c.estado !== "borrador") {
        throw new TRPCError({ code: "CONFLICT", message: "Solo se descarta un borrador" });
      }
      await ctx.db.update(comunicados).set({ estado: "cancelado" })
        .where(eq(comunicados.id, input.comunicadoId));
      return { estado: "cancelado" as const };
    }),
});

/** El comunicado, si el usuario tiene permiso sobre todo su alcance. */
async function comunicadoPropio(
  ctx: { db: import("../db/index.js").Database; usuario: { roles: import("../auth/roles.js").RolOtorgado[] } },
  comunicadoId: number,
) {
  const [c] = await ctx.db
    .select({
      inmuebleId: comunicados.inmuebleId,
      edificacionId: comunicados.edificacionId,
      estado: comunicados.estado,
    })
    .from(comunicados)
    .where(eq(comunicados.id, comunicadoId))
    .limit(1);

  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Ese comunicado no existe" });

  const destinos = (await ctx.db
    .select({ id: comunicadoUnidades.inmuebleId })
    .from(comunicadoUnidades)
    .where(eq(comunicadoUnidades.comunicadoId, comunicadoId))).map((d) => d.id);
  const mias = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");

  const puede = destinos.length > 0
    ? destinos.every((id) => mias.includes(id))
    : c.inmuebleId !== null
      ? mias.includes(c.inmuebleId)
      : c.edificacionId !== null && (
          ambitosCon(ctx.usuario.roles, "propietario", "edificacion").includes(c.edificacionId)
          || ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion").includes(c.edificacionId)
        );

  if (!puede) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
  return c;
}
