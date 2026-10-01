import { z } from "zod";
import { and, desc, eq, inArray, or, lt, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { unidadesDelInquilino, esArrendatarioDe } from "../auth/arrendatario.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { usuarios, archivos } from "../db/schema/identidad.js";
import { contratos } from "../db/schema/contrato.js";
import { aplicaciones } from "../db/schema/demanda.js";
import { pagosUnidad } from "../db/schema/dinero.js";
import { areasComunes, reservas } from "../db/schema/reservas.js";

const dinero = z.number().positive().max(999_999_999);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida");
import { comunicados, comunicadoUnidades, comunicadoDestinatarios } from "../db/schema/comunicacion.js";

/**
 * Lo que ve y hace quien arrienda una unidad.
 *
 * Todo se ancla a `unidadesDelInquilino`, no a un rol: el arrendatario existe
 * desde que el propietario lo registra, aunque el contrato todavía no esté
 * firmado. Y solo ve lo suyo — la unidad, sus pagos, los avisos que le llegan —
 * nunca lo que el propietario decide sobre ella.
 */
export const inquilinoRouter = router({
  /** La unidad (o unidades) que arrienda, con su canon, su día de pago, su contrato y sus pagos. */
  miUnidad: privado.query(async ({ ctx }) => {
    const ids = await unidadesDelInquilino(ctx.db, ctx.usuario.id);
    if (ids.length === 0) return [];

    const unidades = await ctx.db
      .select({
        id: inmuebles.id,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        ciudad: inmuebles.ciudad,
        descripcion: inmuebles.descripcion,
        canonBase: inmuebles.canonBase,
        diaPago: inmuebles.diaPago,
        diasGracia: inmuebles.diasGracia,
        propietarioNombre: usuarios.nombre,
        propietarioApellido: usuarios.apellido,
        propietarioTelefono: usuarios.telefono,
      })
      .from(inmuebles)
      .innerJoin(usuarios, eq(usuarios.id, inmuebles.propietarioId))
      .where(inArray(inmuebles.id, ids));

    const misContratos = await ctx.db
      .select({
        id: contratos.id, inmuebleId: contratos.inmuebleId, numero: contratos.numero,
        estado: contratos.estado, canonMensual: contratos.canonMensual,
        fechaInicio: contratos.fechaInicio, fechaFin: contratos.fechaFin,
      })
      .from(contratos)
      .where(and(eq(contratos.inquilinoId, ctx.usuario.id), inArray(contratos.inmuebleId, ids)))
      .orderBy(desc(contratos.fechaInicio));

    const designaciones = await ctx.db
      .select({ inmuebleId: aplicaciones.inmuebleId, canon: aplicaciones.canonOfrecido })
      .from(aplicaciones)
      .where(and(eq(aplicaciones.inquilinoId, ctx.usuario.id), eq(aplicaciones.estado, "aprobada")));

    const pagos = await ctx.db
      .select({
        id: pagosUnidad.id, inmuebleId: pagosUnidad.inmuebleId, periodo: pagosUnidad.periodo,
        fechaPago: pagosUnidad.fechaPago, medio: pagosUnidad.medio, monto: pagosUnidad.monto,
        estado: pagosUnidad.estado,
        motivoRechazo: pagosUnidad.motivoRechazo, comprobanteArchivoId: pagosUnidad.comprobanteArchivoId,
      })
      .from(pagosUnidad)
      .where(inArray(pagosUnidad.inmuebleId, ids))
      .orderBy(desc(pagosUnidad.fechaPago));

    return unidades.map((u) => ({
      ...u,
      // Lo acordado con esta persona manda sobre el canon de lista de la unidad.
      canon: Number(designaciones.find((d) => d.inmuebleId === u.id)?.canon ?? u.canonBase),
      contrato: misContratos.find((c) => c.inmuebleId === u.id) ?? null,
      pagos: pagos.filter((p) => p.inmuebleId === u.id),
    }));
  }),

  /**
   * Sube el pago del mes con su comprobante.
   *
   * Queda `pendiente` hasta que el propietario lo confirme: un pago que sube
   * el propio inquilino no puede poner el mes en verde por sí solo.
   */
  /** Igual que `facturacion.registrarPagoUnidad`, pero nace pendiente: el
   *  propietario lo confirma o lo rechaza antes de que cuente como pagado. */
  subirPago: privado
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      fechaPago: z.coerce.date(),
      partes: z.array(z.object({
        monto: dinero,
        medio: z.enum(["efectivo", "transferencia"]),
        comprobanteArchivoId: z.number().int().positive().optional(),
      })).min(1).max(6),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await esArrendatarioDe(ctx.db, ctx.usuario.id, input.inmuebleId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa unidad no es la que arrendás" });
      }
      for (const parte of input.partes) {
        if (parte.medio === "transferencia" && parte.comprobanteArchivoId === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Una transferencia necesita comprobante" });
        }
        if (parte.comprobanteArchivoId !== undefined) {
          const [a] = await ctx.db.select({ tipo: archivos.entidadTipo, entidad: archivos.entidadId })
            .from(archivos).where(eq(archivos.id, parte.comprobanteArchivoId)).limit(1);
          if (!a || a.tipo !== "pago_unidad" || a.entidad !== input.inmuebleId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ese comprobante no es de esta unidad" });
          }
        }
      }
      const f = input.fechaPago;
      const periodo = `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
      await ctx.db.insert(pagosUnidad).values(input.partes.map((parte) => ({
        inmuebleId: input.inmuebleId, periodo, fechaPago: f, medio: parte.medio,
        monto: parte.monto.toFixed(2),
        estado: "pendiente" as const, comprobanteArchivoId: parte.comprobanteArchivoId ?? null,
        registradoPorId: ctx.usuario.id,
      })));
      return { periodo };
    }),

  /** Los avisos ya enviados que le llegan, cada uno con su marca de leído. */
  avisos: privado.query(({ ctx }) => avisosDe(ctx)),

  /** Marca un aviso como leído o como no leído. Es de cada persona: no afecta a los demás. */
  marcarAviso: privado
    .input(z.object({ comunicadoId: z.number().int().positive(), leido: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const visibles = await avisosDe(ctx);
      if (!visibles.some((a) => a.id === input.comunicadoId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ese aviso no es tuyo" });
      }
      const ahora = new Date();
      await ctx.db.insert(comunicadoDestinatarios).values({
        comunicadoId: input.comunicadoId, usuarioId: ctx.usuario.id, rolDestinatario: "inquilino",
        estado: input.leido ? "leido" : "entregado", leidoAt: input.leido ? ahora.toISOString().slice(0, 19).replace("T", " ") : null,
      }).onDuplicateKeyUpdate({
        set: {
          estado: input.leido ? "leido" : "entregado",
          leidoAt: input.leido ? ahora.toISOString().slice(0, 19).replace("T", " ") : null,
        },
      });
      return { leido: input.leido };
    }),

  /** Las áreas comunes que puede reservar: las de su unidad, o las de la
   *  edificación si pertenece a una. Solo las activas. */
  areasComunes: privado.query(async ({ ctx }) => {
    const ids = await unidadesDelInquilino(ctx.db, ctx.usuario.id);
    if (ids.length === 0) return [];
    const unidades = await ctx.db
      .select({ id: inmuebles.id, edificacionId: inmuebles.edificacionId })
      .from(inmuebles).where(inArray(inmuebles.id, ids));
    const idsEdificacion = [...new Set(unidades.filter((u) => u.edificacionId !== null).map((u) => u.edificacionId!))];
    const idsSueltas = unidades.filter((u) => u.edificacionId === null).map((u) => u.id);
    if (idsEdificacion.length === 0 && idsSueltas.length === 0) return [];
    return ctx.db
      .select({
        id: areasComunes.id, nombre: areasComunes.nombre, descripcion: areasComunes.descripcion,
        capacidad: areasComunes.capacidad,
      })
      .from(areasComunes)
      .where(and(
        eq(areasComunes.activa, true),
        or(
          ...(idsSueltas.length > 0 ? [inArray(areasComunes.inmuebleId, idsSueltas)] : []),
          ...(idsEdificacion.length > 0 ? [inArray(areasComunes.edificacionId, idsEdificacion)] : []),
        ),
      ))
      .orderBy(areasComunes.nombre);
  }),

  /** Mis reservas, la más reciente primero. */
  misReservas: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: reservas.id, area: areasComunes.nombre,
        fecha: reservas.fecha, horaInicio: reservas.horaInicio, horaFin: reservas.horaFin,
        estado: reservas.estado, createdAt: reservas.createdAt,
      })
      .from(reservas)
      .innerJoin(areasComunes, eq(areasComunes.id, reservas.areaComunId))
      .where(eq(reservas.solicitanteId, ctx.usuario.id))
      .orderBy(desc(reservas.fecha), desc(reservas.horaInicio)),
  ),

  /**
   * Pide una reserva de un área de su unidad o de su edificación. Nace
   * pendiente: aprobarla es cosa del propietario o de quien administra.
   */
  reservar: privado
    .input(z.object({
      areaComunId: z.number().int().positive(),
      fecha: z.coerce.date(),
      horaInicio: hora,
      horaFin: hora,
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.horaFin <= input.horaInicio) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La hora de fin debe ser después de la de inicio" });
      }
      const ids = await unidadesDelInquilino(ctx.db, ctx.usuario.id);
      if (ids.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés una unidad asociada" });

      const [a] = await ctx.db
        .select({ id: areasComunes.id, inmuebleId: areasComunes.inmuebleId, edificacionId: areasComunes.edificacionId, activa: areasComunes.activa, nombre: areasComunes.nombre })
        .from(areasComunes).where(eq(areasComunes.id, input.areaComunId)).limit(1);
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Esa área no existe" });

      let pertenece = a.inmuebleId !== null && ids.includes(a.inmuebleId);
      if (!pertenece && a.edificacionId !== null) {
        const mias = await ctx.db.select({ edificacionId: inmuebles.edificacionId })
          .from(inmuebles).where(inArray(inmuebles.id, ids));
        pertenece = mias.some((u) => u.edificacionId === a.edificacionId);
      }
      if (!pertenece) throw new TRPCError({ code: "FORBIDDEN", message: "Esa área no es de tu unidad" });
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

      const [yo] = await ctx.db.select({ nombre: usuarios.nombre, apellido: usuarios.apellido })
        .from(usuarios).where(eq(usuarios.id, ctx.usuario.id)).limit(1);
      const solicitante = yo ? `${yo.nombre} ${yo.apellido}` : "Sin nombre";

      await ctx.db.insert(reservas).values({
        areaComunId: input.areaComunId, solicitanteId: ctx.usuario.id, solicitante,
        fecha: input.fecha, horaInicio: input.horaInicio, horaFin: input.horaFin, estado: "pendiente",
      });
      return { ok: true };
    }),

  /** Se arrepiente de una reserva propia, pendiente o ya aprobada. */
  cancelarReserva: privado
    .input(z.object({ reservaId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select({ estado: reservas.estado, solicitanteId: reservas.solicitanteId })
        .from(reservas).where(eq(reservas.id, input.reservaId)).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Esa reserva no existe" });
      if (r.solicitanteId !== ctx.usuario.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo podés cancelar tus reservas" });
      }
      if (r.estado !== "pendiente" && r.estado !== "aprobada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa reserva ya no está activa" });
      }
      await ctx.db.update(reservas).set({ estado: "cancelada" }).where(eq(reservas.id, input.reservaId));
      return { ok: true };
    }),
});

async function avisosDe(ctx: { db: import("../db/index.js").Database; usuario: { id: number } }) {
  const ids = await unidadesDelInquilino(ctx.db, ctx.usuario.id);
  if (ids.length === 0) return [];

  const edificios = (await ctx.db
    .select({ e: inmuebles.edificacionId })
    .from(inmuebles)
    .where(inArray(inmuebles.id, ids)))
    .map((x) => x.e)
    .filter((x): x is number => x !== null);

  const aMisUnidades = await ctx.db
    .selectDistinct({ id: comunicadoUnidades.comunicadoId })
    .from(comunicadoUnidades)
    .where(inArray(comunicadoUnidades.inmuebleId, ids));

  // Sin ninguno de los dos alcances no hay nada que mostrar: un `or` vacío
  // no filtra, y devolvería los comunicados de todo el mundo.
  if (aMisUnidades.length === 0 && edificios.length === 0) return [];

  const filas = await ctx.db
    .select({
      id: comunicados.id, titulo: comunicados.titulo, cuerpo: comunicados.cuerpo,
      tipo: comunicados.tipo, prioridad: comunicados.prioridad, enviadoAt: comunicados.enviadoAt,
      estadoLectura: comunicadoDestinatarios.estado,
    })
    .from(comunicados)
    .leftJoin(comunicadoDestinatarios, and(
      eq(comunicadoDestinatarios.comunicadoId, comunicados.id),
      eq(comunicadoDestinatarios.usuarioId, ctx.usuario.id),
    ))
    .where(and(
      eq(comunicados.estado, "enviado"),
      or(
        aMisUnidades.length > 0 ? inArray(comunicados.id, aMisUnidades.map((x) => x.id)) : undefined,
        edificios.length > 0 ? inArray(comunicados.edificacionId, edificios) : undefined,
      ),
    ))
    .orderBy(desc(comunicados.enviadoAt));

  return filas.map(({ estadoLectura, ...resto }) => ({ ...resto, leido: estadoLectura === "leido" || estadoLectura === "confirmado" }));
}
