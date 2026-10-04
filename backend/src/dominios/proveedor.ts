import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { incidencias, incidenciaEventos, proveedores } from "../db/schema/operacion.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { tiposIncidencia } from "../db/schema/administracion.js";
import { avisarIncidenciaResuelta } from "./incidencias.js";

const ESTADOS_PROVEEDOR = ["en_progreso", "espera_aprobacion", "resuelta"] as const;

/** El proveedor vinculado a esta cuenta, o nadie: no toda cuenta con el rol
 *  tiene todavía una fila en `proveedores` que la respalde. */
async function proveedorDe(db: import("../db/index.js").Database, usuarioId: number) {
  const [p] = await db.select({ id: proveedores.id })
    .from(proveedores).where(eq(proveedores.usuarioId, usuarioId)).limit(1);
  return p?.id ?? null;
}

/**
 * Lo que un proveedor ve y hace: solo las incidencias que le reenviaron, y
 * solo avanzarlas, nunca verlas todas ni decidir a quién se le asignan.
 */
export const proveedorRouter = router({
  /** Las incidencias que le reenviaron, la más reciente primero. */
  misIncidencias: privado.query(async ({ ctx }) => {
    const proveedorId = await proveedorDe(ctx.db, ctx.usuario.id);
    if (proveedorId === null) return [];

    return ctx.db
      .select({
        id: incidencias.id, titulo: incidencias.titulo, descripcion: incidencias.descripcion,
        estado: incidencias.estado, prioridad: incidencias.prioridad,
        reportadaAt: incidencias.reportadaAt, slaVenceAt: incidencias.slaVenceAt,
        ambito: incidencias.ambito,
        direccion: inmuebles.direccion, complemento: inmuebles.complemento,
        edificacion: edificaciones.nombre,
        tipo: tiposIncidencia.nombre,
      })
      .from(incidencias)
      .leftJoin(inmuebles, eq(inmuebles.id, incidencias.inmuebleId))
      .leftJoin(edificaciones, eq(edificaciones.id, incidencias.edificacionId))
      .leftJoin(tiposIncidencia, eq(tiposIncidencia.id, incidencias.tipoIncidenciaId))
      .where(eq(incidencias.proveedorId, proveedorId))
      .orderBy(desc(incidencias.reportadaAt));
  }),

  /**
   * Avanza una incidencia suya: en progreso, en espera de aprobación, o
   * resuelta. No puede rechazarla ni cerrarla —eso es del propietario— ni
   * tocar una que no sea suya.
   */
  cambiarEstado: privado
    .input(z.object({
      incidenciaId: z.number().int().positive(),
      estado: z.enum(ESTADOS_PROVEEDOR),
      nota: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const proveedorId = await proveedorDe(ctx.db, ctx.usuario.id);
      if (proveedorId === null) throw new TRPCError({ code: "FORBIDDEN", message: "Tu cuenta no está vinculada a un proveedor" });

      const [i] = await ctx.db
        .select({
          proveedorId: incidencias.proveedorId, estado: incidencias.estado,
          titulo: incidencias.titulo, ambito: incidencias.ambito,
          inmuebleId: incidencias.inmuebleId, edificacionId: incidencias.edificacionId,
        })
        .from(incidencias).where(eq(incidencias.id, input.incidenciaId)).limit(1);
      if (!i) throw new TRPCError({ code: "NOT_FOUND", message: "Esa incidencia no existe" });
      if (i.proveedorId !== proveedorId) throw new TRPCError({ code: "FORBIDDEN", message: "Esa incidencia no te la reenviaron a vos" });
      if (i.estado === "cerrada" || i.estado === "rechazada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa incidencia ya no está activa" });
      }

      const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
      const recienResuelta = input.estado === "resuelta" && i.estado !== "resuelta";
      await ctx.db.transaction(async (tx) => {
        await tx.update(incidencias).set({
          estado: input.estado,
          ...(input.estado === "resuelta" ? { resueltaAt: ahora } : {}),
        }).where(eq(incidencias.id, input.incidenciaId));

        await tx.insert(incidenciaEventos).values({
          incidenciaId: input.incidenciaId,
          autorId: ctx.usuario.id,
          tipo: "cambio_estado",
          contenido: input.nota ?? `El proveedor la pasa a ${input.estado}`,
        });

        if (recienResuelta) {
          await avisarIncidenciaResuelta(tx, ctx.usuario.id, {
            incidenciaId: input.incidenciaId, titulo: i.titulo, ambito: i.ambito,
            inmuebleId: i.inmuebleId, edificacionId: i.edificacionId,
          });
        }
      });

      return { estado: input.estado };
    }),
});
