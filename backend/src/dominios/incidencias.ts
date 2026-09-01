import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado, exigirRol } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { incidencias, incidenciaEventos, proveedores } from "../db/schema/operacion.js";
import { inmuebles } from "../db/schema/inventario.js";
import { tiposIncidencia } from "../db/schema/administracion.js";

const ESTADOS = ["abierta", "asignada", "en_progreso", "espera_aprobacion", "resuelta", "cerrada", "rechazada"] as const;
const dinero = z.number().min(0).max(999_999_999);

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

/**
 * Lo que se rompe y quién lo paga.
 *
 * El tipo sale del catálogo que administra Yalqui, no de una lista escrita acá:
 * de él vienen la prioridad sugerida, las horas de SLA y quién asume el costo
 * por defecto. Así, agregar un tipo nuevo no toca este código.
 */
export const incidenciasRouter = router({
  /** Las incidencias de las unidades del propietario. */
  mias: privado
    .input(z.object({ estado: z.enum(ESTADOS).optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
      if (ids.length === 0) return { total: 0, incidencias: [], abiertas: 0, costoAcumulado: 0 };

      const filtros = [
        inArray(incidencias.inmuebleId, ids),
        ...(input.estado === undefined ? [] : [eq(incidencias.estado, input.estado)]),
      ];

      const filas = await ctx.db
        .select({
          id: incidencias.id,
          titulo: incidencias.titulo,
          descripcion: incidencias.descripcion,
          estado: incidencias.estado,
          prioridad: incidencias.prioridad,
          responsableCosto: incidencias.responsableCosto,
          costoEstimado: incidencias.costoEstimado,
          costoFinal: incidencias.costoFinal,
          reportadaAt: incidencias.reportadaAt,
          slaVenceAt: incidencias.slaVenceAt,
          resueltaAt: incidencias.resueltaAt,
          inmuebleId: inmuebles.id,
          direccion: inmuebles.direccion,
          complemento: inmuebles.complemento,
          tipo: tiposIncidencia.nombre,
          proveedor: proveedores.razonSocial,
        })
        .from(incidencias)
        .innerJoin(inmuebles, eq(inmuebles.id, incidencias.inmuebleId))
        .leftJoin(tiposIncidencia, eq(tiposIncidencia.id, incidencias.tipoIncidenciaId))
        .leftJoin(proveedores, eq(proveedores.id, incidencias.proveedorId))
        .where(and(...filtros))
        .orderBy(desc(incidencias.reportadaAt));

      const ahora = new Date();
      const conVencimiento = filas.map((i) => ({
        ...i,
        // Vencida es haber pasado el SLA sin resolver. Una resuelta tarde ya no
        // urge: mostrarla en rojo confundiría lo que falta con lo que pasó.
        vencida: i.slaVenceAt !== null
          && i.resueltaAt === null
          && new Date(i.slaVenceAt) < ahora,
      }));

      const abiertas = conVencimiento.filter(
        (i) => i.estado !== "cerrada" && i.estado !== "rechazada",
      ).length;

      // Solo cuenta lo que el propietario asume: un costo a cargo del inquilino
      // o de la copropiedad no sale de su bolsillo.
      const costoAcumulado = conVencimiento
        .filter((i) => i.responsableCosto === "propietario" || i.responsableCosto === "compartido")
        .reduce((t, i) => t + Number(i.costoFinal ?? i.costoEstimado ?? 0), 0);

      return { total: filas.length, incidencias: conVencimiento, abiertas, costoAcumulado };
    }),

  /** Los tipos que se pueden reportar, del catálogo. */
  tipos: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: tiposIncidencia.id,
        nombre: tiposIncidencia.nombre,
        prioridadSugerida: tiposIncidencia.prioridadSugerida,
        slaHoras: tiposIncidencia.slaHoras,
        responsableSugerido: tiposIncidencia.responsableSugerido,
      })
      .from(tiposIncidencia)
      .where(eq(tiposIncidencia.activo, true))
      .orderBy(tiposIncidencia.orden),
  ),

  reportar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      tipoIncidenciaId: z.number().int().positive(),
      titulo: z.string().trim().min(4).max(191),
      descripcion: z.string().trim().max(4000).optional(),
      prioridad: z.enum(["baja", "media", "alta", "urgente"]).optional(),
      costoEstimado: dinero.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [tipo] = await ctx.db
        .select({
          prioridad: tiposIncidencia.prioridadSugerida,
          slaHoras: tiposIncidencia.slaHoras,
          responsable: tiposIncidencia.responsableSugerido,
          activo: tiposIncidencia.activo,
        })
        .from(tiposIncidencia)
        .where(eq(tiposIncidencia.id, input.tipoIncidenciaId))
        .limit(1);

      if (!tipo) throw new TRPCError({ code: "NOT_FOUND", message: "Ese tipo no existe" });
      if (!tipo.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese tipo está anulado" });

      // El vencimiento sale de las horas del catálogo. Se calcula al reportar y
      // se guarda: si dependiera del catálogo en cada lectura, cambiar el SLA
      // movería la fecha de incidencias que ya estaban corriendo.
      const slaVenceAt = tipo.slaHoras === null
        ? null
        : new Date(Date.now() + tipo.slaHoras * 3_600_000);

      const incidenciaId = await ctx.db.transaction(async (tx) => {
        const [res] = await tx.insert(incidencias).values({
          ambito: "unidad",
          inmuebleId: input.inmuebleId,
          reportadaPorId: ctx.usuario.id,
          tipoIncidenciaId: input.tipoIncidenciaId,
          titulo: input.titulo,
          descripcion: input.descripcion ?? null,
          prioridad: input.prioridad ?? tipo.prioridad,
          responsableCosto: tipo.responsable,
          estado: "abierta",
          costoEstimado: input.costoEstimado?.toFixed(2) ?? null,
          ...(slaVenceAt === null ? {} : { slaVenceAt: slaVenceAt.toISOString().slice(0, 19).replace("T", " ") }),
        });
        const id = Number((res as { insertId: number }).insertId);

        // El alta queda como comentario: el enum de eventos no tiene «creada»,
        // y la incidencia misma ya es el registro de que se creó. Lo que el
        // evento aporta es el texto con el que se reportó.
        await tx.insert(incidenciaEventos).values({
          incidenciaId: id,
          autorId: ctx.usuario.id,
          tipo: "comentario",
          contenido: input.titulo,
        });

        return id;
      });

      return { incidenciaId, slaVenceAt };
    }),

  /** Mueve la incidencia de estado, dejando rastro de quién y cuándo. */
  cambiarEstado: privado
    .input(z.object({
      incidenciaId: z.number().int().positive(),
      estado: z.enum(ESTADOS),
      nota: z.string().trim().max(500).optional(),
      costoFinal: dinero.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [i] = await ctx.db
        .select({ inmuebleId: incidencias.inmuebleId, estado: incidencias.estado })
        .from(incidencias)
        .where(eq(incidencias.id, input.incidenciaId))
        .limit(1);

      if (!i) throw new TRPCError({ code: "NOT_FOUND", message: "Esa incidencia no existe" });

      const mios = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
      if (i.inmuebleId === null || !mios.includes(i.inmuebleId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
      }
      if (i.estado === "cerrada") {
        throw new TRPCError({ code: "CONFLICT", message: "Una incidencia cerrada ya no se mueve" });
      }

      const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
      await ctx.db.transaction(async (tx) => {
        await tx.update(incidencias).set({
          estado: input.estado,
          ...(input.costoFinal === undefined ? {} : { costoFinal: input.costoFinal.toFixed(2) }),
          ...(input.estado === "resuelta" ? { resueltaAt: ahora } : {}),
          ...(input.estado === "cerrada" ? { cerradaAt: ahora } : {}),
        }).where(eq(incidencias.id, input.incidenciaId));

        await tx.insert(incidenciaEventos).values({
          incidenciaId: input.incidenciaId,
          autorId: ctx.usuario.id,
          tipo: input.estado === "cerrada" ? "cierre" : "cambio_estado",
          contenido: input.nota ?? `Pasa a ${input.estado}`,
        });
      });

      return { estado: input.estado };
    }),
});
