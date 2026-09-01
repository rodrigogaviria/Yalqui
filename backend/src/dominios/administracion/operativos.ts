import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, admin } from "../../trpc/base.js";
import { cambiosDe, codigoCatalogo } from "./comun.js";
import {
  tiposMovimiento, tiposIncidencia, tiposDocumento, requisitos, requisitoDocumentos,
  TIPOS_MOVIMIENTO, AMBITOS_GASTO, RESPONSABLES, PRIORIDADES, AMBITOS_INCIDENCIA,
  APLICA_REQUISITO, MODOS_REQUISITO,
} from "../../db/schema/administracion.js";
import { catalogoAjustes } from "../../db/schema/inventario.js";
import { proveedores } from "../../db/schema/operacion.js";

const id = z.number().int().positive();
const codigo = z.string().trim().regex(codigoCatalogo, "Minúsculas, sin espacios ni tildes");
const nombre = z.string().trim().min(2).max(160);
const texto = z.string().trim().max(500);
const dinero = z.number().min(0).max(99_999_999);

function nuevoId(res: unknown): number {
  return Number((res as { insertId: number }).insertId);
}

export const operativosRouter = router({
  // -------------------------------------------------------------------------
  // Servicios adicionales — lo que se cobra además del canon
  // -------------------------------------------------------------------------
  servicios: admin.query(({ ctx }) =>
    ctx.db.select().from(catalogoAjustes).orderBy(asc(catalogoAjustes.orden), asc(catalogoAjustes.nombre)),
  ),

  crearServicio: admin
    .input(z.object({
      codigo, nombre,
      descripcion: texto.optional(),
      categoria: z.enum(["comodidad", "ocupacion", "mascota", "parqueadero", "servicio", "otro"]),
      tipoCalculo: z.enum(["monto_fijo", "porcentaje", "por_cantidad"]),
      periodicidad: z.enum(["mensual", "unico"]),
      permiteCantidad: z.boolean().default(false),
      valorSugerido: dinero.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [res] = await ctx.db.insert(catalogoAjustes).values({
        codigo: input.codigo,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        categoria: input.categoria,
        tipoCalculo: input.tipoCalculo,
        periodicidad: input.periodicidad,
        permiteCantidad: input.permiteCantidad,
        valorSugerido: input.valorSugerido?.toFixed(2) ?? null,
      });
      return { id: nuevoId(res) };
    }),

  editarServicio: admin
    .input(z.object({
      servicioId: id,
      nombre: nombre.optional(),
      descripcion: texto.optional(),
      categoria: z.enum(["comodidad", "ocupacion", "mascota", "parqueadero", "servicio", "otro"]).optional(),
      tipoCalculo: z.enum(["monto_fijo", "porcentaje", "por_cantidad"]).optional(),
      periodicidad: z.enum(["mensual", "unico"]).optional(),
      permiteCantidad: z.boolean().optional(),
      valorSugerido: dinero.optional(),
      orden: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { servicioId, valorSugerido, ...resto } = input;
      const set = cambiosDe({ ...resto, valorSugerido: valorSugerido?.toFixed(2) });
      await ctx.db.update(catalogoAjustes).set(set).where(eq(catalogoAjustes.id, servicioId));
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Tipos de ingreso y de egreso
  // -------------------------------------------------------------------------
  movimientos: admin.query(({ ctx }) =>
    ctx.db.select().from(tiposMovimiento)
      .orderBy(asc(tiposMovimiento.tipo), asc(tiposMovimiento.orden), asc(tiposMovimiento.nombre)),
  ),

  crearMovimiento: admin
    .input(z.object({
      codigo, nombre,
      tipo: z.enum(TIPOS_MOVIMIENTO),
      descripcion: texto.optional(),
      deducible: z.boolean().default(false),
      ambito: z.enum(AMBITOS_GASTO).default("ambos"),
      responsable: z.enum(RESPONSABLES).default("por_definir"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Un ingreso no se deduce de nada: la marca solo tiene sentido en el gasto.
      if (input.tipo === "ingreso" && input.deducible) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Un ingreso no puede ser deducible" });
      }
      const [res] = await ctx.db.insert(tiposMovimiento).values({
        codigo: input.codigo, nombre: input.nombre, tipo: input.tipo,
        descripcion: input.descripcion ?? null, deducible: input.deducible,
        ambito: input.ambito, responsable: input.responsable,
      });
      return { id: nuevoId(res) };
    }),

  editarMovimiento: admin
    .input(z.object({
      movimientoId: id,
      nombre: nombre.optional(),
      descripcion: texto.optional(),
      deducible: z.boolean().optional(),
      ambito: z.enum(AMBITOS_GASTO).optional(),
      responsable: z.enum(RESPONSABLES).optional(),
      orden: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { movimientoId, ...campos } = input;

      if (campos.deducible === true) {
        const [actual] = await ctx.db.select({ tipo: tiposMovimiento.tipo })
          .from(tiposMovimiento).where(eq(tiposMovimiento.id, movimientoId)).limit(1);
        if (actual?.tipo === "ingreso") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Un ingreso no puede ser deducible" });
        }
      }

      await ctx.db.update(tiposMovimiento).set(cambiosDe(campos))
        .where(eq(tiposMovimiento.id, movimientoId));
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Tipos de incidencia
  // -------------------------------------------------------------------------
  incidencias: admin.query(({ ctx }) =>
    ctx.db.select().from(tiposIncidencia).orderBy(asc(tiposIncidencia.orden), asc(tiposIncidencia.nombre)),
  ),

  crearIncidencia: admin
    .input(z.object({
      codigo, nombre,
      descripcion: texto.optional(),
      ambito: z.enum(AMBITOS_INCIDENCIA).default("ambos"),
      prioridadSugerida: z.enum(PRIORIDADES).default("media"),
      slaHoras: z.number().int().min(1).max(8760).optional(),
      responsableSugerido: z.enum(RESPONSABLES).default("por_definir"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [res] = await ctx.db.insert(tiposIncidencia).values({
        codigo: input.codigo, nombre: input.nombre,
        descripcion: input.descripcion ?? null, ambito: input.ambito,
        prioridadSugerida: input.prioridadSugerida,
        slaHoras: input.slaHoras ?? null,
        responsableSugerido: input.responsableSugerido,
      });
      return { id: nuevoId(res) };
    }),

  editarIncidencia: admin
    .input(z.object({
      incidenciaId: id,
      nombre: nombre.optional(),
      descripcion: texto.optional(),
      ambito: z.enum(AMBITOS_INCIDENCIA).optional(),
      prioridadSugerida: z.enum(PRIORIDADES).optional(),
      slaHoras: z.number().int().min(1).max(8760).optional(),
      responsableSugerido: z.enum(RESPONSABLES).optional(),
      orden: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { incidenciaId, ...campos } = input;
      await ctx.db.update(tiposIncidencia).set(cambiosDe(campos))
        .where(eq(tiposIncidencia.id, incidenciaId));
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Tipos de documento
  // -------------------------------------------------------------------------
  documentos: admin.query(({ ctx }) =>
    ctx.db.select().from(tiposDocumento).orderBy(asc(tiposDocumento.orden), asc(tiposDocumento.nombre)),
  ),

  crearDocumento: admin
    .input(z.object({
      codigo, nombre,
      descripcion: texto.optional(),
      vigenciaDias: z.number().int().min(1).max(3650).optional(),
      formatos: z.string().trim().max(120).default("pdf,jpg,png"),
      tamanoMaxMb: z.number().int().min(1).max(50).default(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const [res] = await ctx.db.insert(tiposDocumento).values({
        codigo: input.codigo, nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        vigenciaDias: input.vigenciaDias ?? null,
        formatos: input.formatos, tamanoMaxMb: input.tamanoMaxMb,
      });
      return { id: nuevoId(res) };
    }),

  editarDocumento: admin
    .input(z.object({
      documentoId: id,
      nombre: nombre.optional(),
      descripcion: texto.optional(),
      vigenciaDias: z.number().int().min(1).max(3650).optional(),
      formatos: z.string().trim().max(120).optional(),
      tamanoMaxMb: z.number().int().min(1).max(50).optional(),
      orden: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { documentoId, ...campos } = input;
      await ctx.db.update(tiposDocumento).set(cambiosDe(campos))
        .where(eq(tiposDocumento.id, documentoId));
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Requisitos y los documentos que los soportan
  // -------------------------------------------------------------------------
  requisitos: admin.query(async ({ ctx }) => {
    const filas = await ctx.db.select().from(requisitos)
      .orderBy(asc(requisitos.aplicaA), asc(requisitos.orden), asc(requisitos.nombre));

    // Los vínculos se traen de una sola vez y se agrupan en memoria: una
    // consulta por requisito serían nueve viajes para pintar una tabla.
    const vinculos = await ctx.db
      .select({
        requisitoId: requisitoDocumentos.requisitoId,
        vinculoId: requisitoDocumentos.id,
        tipoDocumentoId: tiposDocumento.id,
        documento: tiposDocumento.nombre,
        vigenciaDias: tiposDocumento.vigenciaDias,
      })
      .from(requisitoDocumentos)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, requisitoDocumentos.tipoDocumentoId))
      .orderBy(asc(requisitoDocumentos.orden));

    return filas.map((r) => ({
      ...r,
      documentos: vinculos.filter((v) => v.requisitoId === r.id),
    }));
  }),

  crearRequisito: admin
    .input(z.object({
      codigo, nombre,
      descripcion: texto.optional(),
      aplicaA: z.enum(APLICA_REQUISITO),
      modo: z.enum(MODOS_REQUISITO).default("cualquiera"),
      obligatorio: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [res] = await ctx.db.insert(requisitos).values({
        codigo: input.codigo, nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        aplicaA: input.aplicaA, modo: input.modo, obligatorio: input.obligatorio,
      });
      return { id: nuevoId(res) };
    }),

  editarRequisito: admin
    .input(z.object({
      requisitoId: id,
      nombre: nombre.optional(),
      descripcion: texto.optional(),
      aplicaA: z.enum(APLICA_REQUISITO).optional(),
      modo: z.enum(MODOS_REQUISITO).optional(),
      obligatorio: z.boolean().optional(),
      orden: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { requisitoId, ...campos } = input;
      await ctx.db.update(requisitos).set(cambiosDe(campos)).where(eq(requisitos.id, requisitoId));
      return { ok: true };
    }),

  /** Dice con qué documento se puede satisfacer un requisito. */
  vincularDocumento: admin
    .input(z.object({ requisitoId: id, tipoDocumentoId: id }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(requisitoDocumentos)
        .values({ requisitoId: input.requisitoId, tipoDocumentoId: input.tipoDocumentoId })
        // Vincular dos veces el mismo documento no es un error, es un clic
        // repetido: se ignora en vez de reventar.
        .onDuplicateKeyUpdate({ set: { requisitoId: input.requisitoId } });
      return { ok: true };
    }),

  desvincularDocumento: admin
    .input(z.object({ vinculoId: id }))
    .mutation(async ({ ctx, input }) => {
      // El vínculo sí se borra: no es configuración con historia, es una lista
      // de opciones. Lo que nunca se borra es el requisito ni el documento.
      await ctx.db.delete(requisitoDocumentos).where(eq(requisitoDocumentos.id, input.vinculoId));
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Proveedores
  // -------------------------------------------------------------------------
  proveedores: admin.query(({ ctx }) =>
    ctx.db.select().from(proveedores).orderBy(asc(proveedores.razonSocial)),
  ),

  editarProveedor: admin
    .input(z.object({
      proveedorId: id,
      razonSocial: nombre.optional(),
      nit: z.string().trim().max(30).optional(),
      ciudad: z.string().trim().max(120).optional(),
      telefono: z.string().trim().max(30).optional(),
      email: z.string().trim().email().max(191).optional(),
      /** Los códigos de `tipos_incidencia` que sabe resolver. */
      especialidades: z.array(z.string().trim().max(40)).max(30).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { proveedorId, ...campos } = input;
      await ctx.db.update(proveedores).set(cambiosDe(campos)).where(eq(proveedores.id, proveedorId));
      return { ok: true };
    }),

  /**
   * Anula o reactiva un registro de configuración.
   *
   * Nunca se borra: un movimiento ya clasificado, un documento ya cargado o una
   * incidencia ya abierta siguen apuntando a su fila del catálogo, y borrarla
   * dejaría esos registros señalando a nada. Anular lo saca de los formularios
   * sin tocar lo que ya se registró con él.
   */
  anular: admin
    .input(z.object({
      catalogo: z.enum(["servicio", "movimiento", "incidencia", "documento", "requisito", "proveedor"]),
      id,
      activo: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tabla = {
        servicio: catalogoAjustes, movimiento: tiposMovimiento, incidencia: tiposIncidencia,
        documento: tiposDocumento, requisito: requisitos, proveedor: proveedores,
      }[input.catalogo];

      await ctx.db.update(tabla).set({ activo: input.activo }).where(eq(tabla.id, input.id));
      return { ok: true };
    }),
});
