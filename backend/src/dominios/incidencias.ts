import { z } from "zod";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import type { Contexto } from "../context.js";
import { ambitosCon } from "../auth/roles.js";
import { incidencias, incidenciaEventos, proveedores } from "../db/schema/operacion.js";
import { contratos } from "../db/schema/contrato.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { usuarios } from "../db/schema/identidad.js";
import { tiposIncidencia } from "../db/schema/administracion.js";

const ESTADOS = ["abierta", "asignada", "en_progreso", "espera_aprobacion", "resuelta", "cerrada", "rechazada"] as const;
const dinero = z.number().min(0).max(999_999_999);

/**
 * Sobre qué unidades y edificaciones alcanza este usuario, y por qué.
 *
 * Una incidencia la ve quien tiene algo que ver con el inmueble: su propietario,
 * el administrador de la edificación, y el inquilino que vive en ella. Los tres
 * llegan por caminos distintos —rol sobre el inmueble, sobre la edificación, o
 * sobre un contrato— y por eso no alcanza con `ambitosCon` de un solo rol.
 */
async function alcanceDe(ctx: Contexto & { usuario: NonNullable<Contexto["usuario"]> }) {
  const propias = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
  const idsEdificacion = ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion");
  const contratosMios = ambitosCon(ctx.usuario.roles, "inquilino", "contrato");

  // El administrador manda sobre la edificación, así que alcanza a todas sus
  // unidades: una fuga en el 206 es asunto suyo aunque el 206 no sea suyo.
  const deEdificacion = idsEdificacion.length === 0 ? [] : await ctx.db
    .select({ id: inmuebles.id })
    .from(inmuebles)
    .where(inArray(inmuebles.edificacionId, idsEdificacion));

  const arrendadas = contratosMios.length === 0 ? [] : await ctx.db
    .select({ inmuebleId: contratos.inmuebleId })
    .from(contratos)
    .where(inArray(contratos.id, contratosMios));

  const unidades = new Set<number>([
    ...propias,
    ...deEdificacion.map((u) => u.id),
    ...arrendadas.map((c) => c.inmuebleId),
  ]);

  return { unidades: [...unidades], edificaciones: idsEdificacion };
}

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
      // Se renombra al desestructurar: `edificaciones` es la tabla importada, y
      // taparla acá haría que el join de abajo apuntara a un arreglo de ids.
      const { unidades, edificaciones: idsEdificacion } = await alcanceDe(ctx);
      if (unidades.length === 0 && idsEdificacion.length === 0) {
        return { total: 0, incidencias: [], abiertas: 0, costoAcumulado: 0 };
      }

      // Las de área común de una edificación no cuelgan de ninguna unidad, así
      // que se traen por su propio camino: si solo se filtrara por unidad, el
      // administrador no vería el ascensor detenido.
      const suyas = [
        ...(unidades.length > 0 ? [inArray(incidencias.inmuebleId, unidades)] : []),
        ...(idsEdificacion.length > 0 ? [inArray(incidencias.edificacionId, idsEdificacion)] : []),
      ];

      const filtros = [
        suyas.length === 1 ? suyas[0]! : or(...suyas)!,
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
          ambito: incidencias.ambito,
          celularReporta: incidencias.celularReporta,
          inmuebleId: inmuebles.id,
          direccion: inmuebles.direccion,
          complemento: inmuebles.complemento,
          edificacionId: edificaciones.id,
          edificacion: edificaciones.nombre,
          tipo: tiposIncidencia.nombre,
          proveedor: proveedores.razonSocial,
        })
        .from(incidencias)
        // LEFT y no INNER: una incidencia de área común no tiene unidad, y con
        // INNER desaparecería de la lista del administrador.
        .leftJoin(inmuebles, eq(inmuebles.id, incidencias.inmuebleId))
        .leftJoin(edificaciones, eq(edificaciones.id, incidencias.edificacionId))
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

  /**
   * Reporta una incidencia.
   *
   * La reporta quien la ve: el inquilino que vive en la unidad, el
   * administrador de la edificación o el propietario. Los tres llegan por
   * caminos distintos, así que el permiso se comprueba contra el alcance y no
   * contra un rol fijo.
   */
  reportar: privado
    .input(z.object({
      /** Sobre la unidad, o sobre las zonas comunes del edificio. */
      ambito: z.enum(["unidad", "area_comun"]),
      inmuebleId: z.number().int().positive().optional(),
      edificacionId: z.number().int().positive().optional(),
      tipoIncidenciaId: z.number().int().positive(),
      titulo: z.string().trim().min(4).max(191),
      descripcion: z.string().trim().max(4000).optional(),
      prioridad: z.enum(["baja", "media", "alta", "urgente"]).optional(),
      costoEstimado: dinero.optional(),
      /** A quién llamar. Si no viene, se toma el de quien reporta. */
      celularReporta: z.string().trim().max(30).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.ambito === "unidad" && input.inmuebleId === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Decí sobre qué unidad es" });
      }
      if (input.ambito === "area_comun" && input.edificacionId === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Decí de qué edificación son las zonas comunes" });
      }

      const alcance = await alcanceDe(ctx);
      const puede = input.ambito === "unidad"
        ? alcance.unidades.includes(input.inmuebleId!)
        : alcance.edificaciones.includes(input.edificacionId!);

      if (!puede) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
      }

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

      // El teléfono por defecto es el de quien reporta, que casi siempre es
      // quien va a estar en el inmueble cuando llegue el técnico.
      let celular = input.celularReporta ?? null;
      if (celular === null) {
        const [yo] = await ctx.db
          .select({ telefono: usuarios.telefono })
          .from(usuarios)
          .where(eq(usuarios.id, ctx.usuario.id))
          .limit(1);
        celular = yo?.telefono ?? null;
      }

      // El vencimiento sale de las horas del catálogo. Se calcula al reportar y
      // se guarda: si dependiera del catálogo en cada lectura, cambiar el SLA
      // movería la fecha de incidencias que ya estaban corriendo.
      const slaVenceAt = tipo.slaHoras === null
        ? null
        : new Date(Date.now() + tipo.slaHoras * 3_600_000);

      const incidenciaId = await ctx.db.transaction(async (tx) => {
        const [res] = await tx.insert(incidencias).values({
          ambito: input.ambito,
          inmuebleId: input.inmuebleId ?? null,
          edificacionId: input.edificacionId ?? null,
          reportadaPorId: ctx.usuario.id,
          celularReporta: celular,
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

      return { incidenciaId, slaVenceAt, celularReporta: celular };
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
        .select({
          inmuebleId: incidencias.inmuebleId,
          edificacionId: incidencias.edificacionId,
          estado: incidencias.estado,
        })
        .from(incidencias)
        .where(eq(incidencias.id, input.incidenciaId))
        .limit(1);

      if (!i) throw new TRPCError({ code: "NOT_FOUND", message: "Esa incidencia no existe" });

      const alcance = await alcanceDe(ctx);
      const puede = i.inmuebleId !== null
        ? alcance.unidades.includes(i.inmuebleId)
        : i.edificacionId !== null && alcance.edificaciones.includes(i.edificacionId);

      if (!puede) {
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
