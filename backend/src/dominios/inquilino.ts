import { z } from "zod";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { unidadesDelInquilino, esArrendatarioDe } from "../auth/arrendatario.js";
import { inmuebles } from "../db/schema/inventario.js";
import { usuarios, archivos } from "../db/schema/identidad.js";
import { contratos } from "../db/schema/contrato.js";
import { aplicaciones } from "../db/schema/demanda.js";
import { pagosUnidad } from "../db/schema/dinero.js";
import { comunicados, comunicadoUnidades } from "../db/schema/comunicacion.js";

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
        fechaPago: pagosUnidad.fechaPago, medio: pagosUnidad.medio, estado: pagosUnidad.estado,
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
  subirPago: privado
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      fechaPago: z.coerce.date(),
      medio: z.enum(["efectivo", "transferencia"]),
      comprobanteArchivoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await esArrendatarioDe(ctx.db, ctx.usuario.id, input.inmuebleId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa unidad no es la que arrendás" });
      }
      if (input.medio === "transferencia" && input.comprobanteArchivoId === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Una transferencia necesita comprobante" });
      }
      if (input.comprobanteArchivoId !== undefined) {
        const [a] = await ctx.db.select({ tipo: archivos.entidadTipo, entidad: archivos.entidadId })
          .from(archivos).where(eq(archivos.id, input.comprobanteArchivoId)).limit(1);
        if (!a || a.tipo !== "pago_unidad" || a.entidad !== input.inmuebleId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ese comprobante no es de esta unidad" });
        }
      }
      const f = input.fechaPago;
      const periodo = `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
      await ctx.db.insert(pagosUnidad).values({
        inmuebleId: input.inmuebleId, periodo, fechaPago: f, medio: input.medio,
        estado: "pendiente", comprobanteArchivoId: input.comprobanteArchivoId ?? null,
        registradoPorId: ctx.usuario.id,
      });
      return { periodo };
    }),

  /** Los avisos ya enviados que le llegan: a su unidad o a todo su edificio. */
  avisos: privado.query(async ({ ctx }) => {
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

    return ctx.db
      .select({
        id: comunicados.id, titulo: comunicados.titulo, cuerpo: comunicados.cuerpo,
        tipo: comunicados.tipo, prioridad: comunicados.prioridad, enviadoAt: comunicados.enviadoAt,
      })
      .from(comunicados)
      .where(and(
        eq(comunicados.estado, "enviado"),
        or(
          aMisUnidades.length > 0 ? inArray(comunicados.id, aMisUnidades.map((x) => x.id)) : undefined,
          edificios.length > 0 ? inArray(comunicados.edificacionId, edificios) : undefined,
        ),
      ))
      .orderBy(desc(comunicados.enviadoAt));
  }),
});
