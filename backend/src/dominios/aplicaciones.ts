import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado, exigirRol } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { usuarios } from "../db/schema/identidad.js";
import { aplicaciones, aplicacionAjustes, aplicacionDocumentos, precalificaciones } from "../db/schema/demanda.js";
import { inmuebles, inmuebleAjustes, catalogoAjustes } from "../db/schema/inventario.js";

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

export const aplicacionesRouter = router({
  /**
   * Aplica y elige los servicios adicionales.
   *
   * El canon ofrecido se calcula acá y no se recibe del cliente: dos aplicantes
   * que ofrecen «lo mismo» no son comparables si uno quiere parqueadero y el
   * otro no, y un valor que manda el navegador no es un precio, es una opinión.
   */
  aplicar: privado
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      precalificacionId: z.number().int().positive().optional(),
      fechaIngresoDeseada: z.coerce.date().optional(),
      numOcupantes: z.number().int().min(1).max(50).default(1),
      numMascotas: z.number().int().min(0).max(20).default(0),
      mensaje: z.string().trim().max(2000).optional(),
      ajustes: z.array(z.object({
        ajusteId: z.number().int().positive(),
        cantidad: z.number().int().min(1).max(20).default(1),
      })).max(20).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [u] = await ctx.db
        .select({
          estado: inmuebles.estado, canonBase: inmuebles.canonBase,
          propietarioId: inmuebles.propietarioId,
          ocupantesMaximo: inmuebles.ocupantesMaximo, ocupantesBase: inmuebles.ocupantesBase,
          mascotasMaximo: inmuebles.mascotasMaximo,
        })
        .from(inmuebles).where(eq(inmuebles.id, input.inmuebleId)).limit(1);

      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Esa unidad no existe" });
      if (u.estado !== "publicado") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa unidad ya no está disponible" });
      }
      if (u.propietarioId === ctx.usuario.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No podés aplicar a tu propia unidad" });
      }

      const tope = u.ocupantesMaximo ?? u.ocupantesBase;
      if (input.numOcupantes > tope) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Esta unidad admite hasta ${tope} personas` });
      }
      if (input.numMascotas > u.mascotasMaximo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: u.mascotasMaximo === 0 ? "Esta unidad no admite mascotas"
                                          : `Esta unidad admite hasta ${u.mascotasMaximo} mascota(s)`,
        });
      }

      const yaAplico = await ctx.db.select({ id: aplicaciones.id }).from(aplicaciones)
        .where(and(eq(aplicaciones.inmuebleId, input.inmuebleId),
                   eq(aplicaciones.inquilinoId, ctx.usuario.id),
                   inArray(aplicaciones.estado, ["enviada", "en_verificacion", "en_negociacion", "aprobada"])))
        .limit(1);
      if (yaAplico.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya tenés una aplicación abierta en esta unidad" });
      }

      // Los precios salen de lo que el propietario configuró, no de la entrada.
      const ofrecidos = input.ajustes.map((a) => a.ajusteId);
      const disponibles = ofrecidos.length === 0 ? [] : await ctx.db
        .select({
          ajusteId: inmuebleAjustes.ajusteId, valor: inmuebleAjustes.valor,
          disponible: inmuebleAjustes.disponible, cantidadMaxima: inmuebleAjustes.cantidadMaxima,
          nombre: catalogoAjustes.nombre,
        })
        .from(inmuebleAjustes)
        .innerJoin(catalogoAjustes, eq(catalogoAjustes.id, inmuebleAjustes.ajusteId))
        .where(and(eq(inmuebleAjustes.inmuebleId, input.inmuebleId),
                   inArray(inmuebleAjustes.ajusteId, ofrecidos)));

      const lineas = input.ajustes.map((pedido) => {
        const d = disponibles.find((x) => x.ajusteId === pedido.ajusteId);
        if (!d || !d.disponible) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esa unidad no ofrece uno de los ajustes pedidos" });
        }
        if (d.cantidadMaxima !== null && pedido.cantidad > d.cantidadMaxima) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${d.nombre}: máximo ${d.cantidadMaxima}` });
        }
        const unit = Number(d.valor);
        return { ajusteId: pedido.ajusteId, cantidad: pedido.cantidad, valorUnitario: unit, valorTotal: unit * pedido.cantidad };
      });

      const canonOfrecido = Number(u.canonBase) + lineas.reduce((t, l) => t + l.valorTotal, 0);

      const aplicacionId = await ctx.db.transaction(async (tx) => {
        const [res] = await tx.insert(aplicaciones).values({
          inmuebleId: input.inmuebleId,
          inquilinoId: ctx.usuario.id,
          precalificacionId: input.precalificacionId ?? null,
          estado: "enviada",
          canonOfrecido: canonOfrecido.toFixed(2),
          fechaIngresoDeseada: input.fechaIngresoDeseada ?? null,
          numOcupantes: input.numOcupantes,
          numMascotas: input.numMascotas,
          mensaje: input.mensaje ?? null,
          enviadaAt: new Date(),
        });
        const id = Number((res as { insertId: number }).insertId);

        if (lineas.length > 0) {
          await tx.insert(aplicacionAjustes).values(lineas.map((l) => ({
            aplicacionId: id, ajusteId: l.ajusteId, cantidad: l.cantidad,
            valorUnitario: l.valorUnitario.toFixed(2), valorTotal: l.valorTotal.toFixed(2),
          })));
        }
        return id;
      });

      return { aplicacionId, canonOfrecido, ajustes: lineas.length };
    }),

  /** Sube un soporte. Obligatorio u opcional según lo que pida la unidad. */
  subirDocumento: privado
    .input(z.object({
      aplicacionId: z.number().int().positive(),
      tipo: z.enum(["documento_identidad", "certificado_laboral", "extractos_bancarios",
                    "declaracion_renta", "referencia", "rut", "otro"]),
      archivoId: z.number().int().positive(),
      obligatorio: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const [a] = await ctx.db.select({ inquilinoId: aplicaciones.inquilinoId })
        .from(aplicaciones).where(eq(aplicaciones.id, input.aplicacionId)).limit(1);
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Esa aplicación no existe" });
      if (a.inquilinoId !== ctx.usuario.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa aplicación no es tuya" });
      }

      const [res] = await ctx.db.insert(aplicacionDocumentos).values({
        aplicacionId: input.aplicacionId, tipo: input.tipo, archivoId: input.archivoId,
        obligatorio: input.obligatorio, estadoRevision: "pendiente",
      });
      return { documentoId: Number((res as { insertId: number }).insertId) };
    }),

  /** Las aplicaciones de una unidad, lado a lado — que es donde de verdad se decide. */
  /**
   * Las aplicaciones de todo el portafolio.
   *
   * `deUnidad` responde por una sola unidad, que sirve cuando ya se está
   * mirando esa unidad. Para decidir a quién atender primero hace falta verlas
   * todas juntas: quien tiene cinco unidades no va a entrar a cada una para
   * enterarse de que en dos no hay nada.
   */
  paraMi: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (ids.length === 0) return { total: 0, aplicaciones: [] };

    const filas = await ctx.db
      .select({
        id: aplicaciones.id,
        estado: aplicaciones.estado,
        canonOfrecido: aplicaciones.canonOfrecido,
        numOcupantes: aplicaciones.numOcupantes,
        numMascotas: aplicaciones.numMascotas,
        fechaIngresoDeseada: aplicaciones.fechaIngresoDeseada,
        enviadaAt: aplicaciones.enviadaAt,
        motivoRechazo: aplicaciones.motivoRechazo,
        inmuebleId: inmuebles.id,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        canonBase: inmuebles.canonBase,
        nivel: precalificaciones.nivel,
        relacionPct: precalificaciones.relacionPct,
        candidato: usuarios.nombre,
        candidatoApellido: usuarios.apellido,
      })
      .from(aplicaciones)
      .innerJoin(inmuebles, eq(inmuebles.id, aplicaciones.inmuebleId))
      .innerJoin(usuarios, eq(usuarios.id, aplicaciones.inquilinoId))
      .leftJoin(precalificaciones, eq(precalificaciones.id, aplicaciones.precalificacionId))
      .where(inArray(aplicaciones.inmuebleId, ids))
      .orderBy(desc(aplicaciones.enviadaAt));

    const abiertas = filas.filter(
      (a) => a.estado === "enviada" || a.estado === "en_verificacion" || a.estado === "en_negociacion",
    ).length;

    return { total: filas.length, aplicaciones: filas, abiertas };
  }),

  deUnidad: delPropietario
    .input(z.object({ inmuebleId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const filas = await ctx.db
        .select({
          id: aplicaciones.id, inquilinoId: aplicaciones.inquilinoId,
          estado: aplicaciones.estado, canonOfrecido: aplicaciones.canonOfrecido,
          numOcupantes: aplicaciones.numOcupantes, numMascotas: aplicaciones.numMascotas,
          fechaIngresoDeseada: aplicaciones.fechaIngresoDeseada, enviadaAt: aplicaciones.enviadaAt,
          precalificacionNivel: precalificaciones.nivel,
          precalificacionRelacion: precalificaciones.relacionPct,
        })
        .from(aplicaciones)
        .leftJoin(precalificaciones, eq(precalificaciones.id, aplicaciones.precalificacionId))
        .where(eq(aplicaciones.inmuebleId, input.inmuebleId));
      return { total: filas.length, aplicaciones: filas };
    }),

  /** Revisa un soporte. Es revisión humana, no verificación de autenticidad. */
  revisarDocumento: privado
    .input(z.object({
      documentoId: z.number().int().positive(),
      estado: z.enum(["aceptado", "rechazado"]),
      nota: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [d] = await ctx.db
        .select({ inmuebleId: aplicaciones.inmuebleId })
        .from(aplicacionDocumentos)
        .innerJoin(aplicaciones, eq(aplicaciones.id, aplicacionDocumentos.aplicacionId))
        .where(eq(aplicacionDocumentos.id, input.documentoId)).limit(1);
      if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Ese documento no existe" });

      const puede = ctx.usuario.roles.some(
        (r) => r.rol === "propietario" && r.ambitoTipo === "inmueble" && r.ambitoId === d.inmuebleId,
      ) || ctx.usuario.roles.some((r) => r.rol === "admin_yalqui");
      if (!puede) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa aplicación" });

      await ctx.db.update(aplicacionDocumentos).set({
        estadoRevision: input.estado, revisadoPorId: ctx.usuario.id,
        revisadoAt: new Date(), nota: input.nota ?? null,
      }).where(eq(aplicacionDocumentos.id, input.documentoId));
      return { estado: input.estado };
    }),

  /**
   * Decide. Aprobar otorga al aplicante el rol de inquilino sobre el contrato
   * que viene; rechazar guarda el motivo con el nombre de quien decidió.
   */
  decidir: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      aplicacionId: z.number().int().positive(),
      decision: z.enum(["aprobada", "rechazada"]),
      motivo: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [a] = await ctx.db.select().from(aplicaciones)
        .where(and(eq(aplicaciones.id, input.aplicacionId),
                   eq(aplicaciones.inmuebleId, input.inmuebleId))).limit(1);
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Esa aplicación no es de esta unidad" });
      if (a.estado === "aprobada" || a.estado === "rechazada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa aplicación ya fue decidida" });
      }
      if (input.decision === "rechazada" && !input.motivo?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Un rechazo necesita motivo" });
      }

      await ctx.db.update(aplicaciones).set({
        estado: input.decision,
        decididaAt: new Date(),
        decididaPorId: ctx.usuario.id,
        motivoRechazo: input.decision === "rechazada" ? (input.motivo ?? null) : null,
      }).where(eq(aplicaciones.id, input.aplicacionId));

      return { estado: input.decision };
    }),

  /** Lo que el inquilino ve de sus propias aplicaciones. */
  mias: privado.query(async ({ ctx }) => {
    const filas = await ctx.db
      .select({
        id: aplicaciones.id, estado: aplicaciones.estado,
        canonOfrecido: aplicaciones.canonOfrecido, enviadaAt: aplicaciones.enviadaAt,
        motivoRechazo: aplicaciones.motivoRechazo,
        direccion: inmuebles.direccion, ciudad: inmuebles.ciudad,
      })
      .from(aplicaciones)
      .innerJoin(inmuebles, eq(inmuebles.id, aplicaciones.inmuebleId))
      .where(eq(aplicaciones.inquilinoId, ctx.usuario.id));
    return { total: filas.length, aplicaciones: filas };
  }),
});
