import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado, exigirRol } from "../trpc/base.js";
import { ambitosCon, tieneRol } from "../auth/roles.js";
import { inmuebles } from "../db/schema/inventario.js";
import { archivos } from "../db/schema/identidad.js";
import { facturasPropiedad, tiposFactura } from "../db/schema/facturasPropiedad.js";

const delPropietario = exigirRol<{ inmuebleId: number }>(
  "propietario", "inmueble", (e) => e.inmuebleId,
);

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD");
const valor = z.number().positive().max(9_999_999_999);

/** Cómo se escribe el período de consumo según cada cuánto llega la factura. */
export function periodoValido(periodicidad: "mensual" | "bimensual" | "anual", periodo: string): boolean {
  if (periodicidad === "mensual") return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
  if (periodicidad === "bimensual") return /^\d{4}-B[1-6]$/.test(periodo);
  return /^\d{4}$/.test(periodo);
}

const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Las facturas que genera la propiedad —agua, energía, gas, predial,
 * seguro— y quién las paga.
 *
 * Nace `sin_pagar` y pasa a `pagado` al registrar el pago, con su fecha, su
 * valor y, si hay, el comprobante. «Vencida» no es un estado guardado: es una
 * factura sin pagar cuya fecha ya pasó, y se calcula al leerla para que no
 * dependa de que alguien la actualice.
 */
export const facturasPropiedadRouter = router({
  /** Los tipos que se pueden registrar, del catálogo que administra Yalqui. */
  tipos: privado.query(({ ctx }) =>
    ctx.db
      .select({
        id: tiposFactura.id, nombre: tiposFactura.nombre,
        categoria: tiposFactura.categoria, periodicidad: tiposFactura.periodicidad,
      })
      .from(tiposFactura)
      .where(eq(tiposFactura.activo, true))
      .orderBy(asc(tiposFactura.orden), asc(tiposFactura.nombre)),
  ),

  mias: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (ids.length === 0) return { total: 0, facturas: [], sinPagar: 0, vencido: 0, pagado: 0 };

    const filas = await ctx.db
      .select({
        id: facturasPropiedad.id,
        inmuebleId: inmuebles.id,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        tipo: tiposFactura.nombre,
        categoria: tiposFactura.categoria,
        periodicidad: tiposFactura.periodicidad,
        periodo: facturasPropiedad.periodo,
        fechaVencimiento: facturasPropiedad.fechaVencimiento,
        valor: facturasPropiedad.valor,
        estado: facturasPropiedad.estado,
        responsable: facturasPropiedad.responsable,
        archivoId: facturasPropiedad.archivoId,
        fechaPago: facturasPropiedad.fechaPago,
        valorPagado: facturasPropiedad.valorPagado,
        comprobanteArchivoId: facturasPropiedad.comprobanteArchivoId,
      })
      .from(facturasPropiedad)
      .innerJoin(inmuebles, eq(inmuebles.id, facturasPropiedad.inmuebleId))
      .innerJoin(tiposFactura, eq(tiposFactura.id, facturasPropiedad.tipoFacturaId))
      .where(inArray(facturasPropiedad.inmuebleId, ids))
      .orderBy(desc(facturasPropiedad.fechaVencimiento));

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    const facturas = filas.map((f) => ({
      ...f,
      situacion: f.estado === "pagado" ? "pagada" as const
        : new Date(f.fechaVencimiento) < hoy ? "vencida" as const : "pendiente" as const,
    }));

    const suma = (fn: (f: (typeof facturas)[number]) => boolean) =>
      facturas.filter(fn).reduce((t, f) => t + Number(f.valor), 0);

    return {
      total: facturas.length,
      facturas,
      sinPagar: suma((f) => f.situacion !== "pagada"),
      vencido: suma((f) => f.situacion === "vencida"),
      pagado: suma((f) => f.situacion === "pagada"),
    };
  }),

  registrar: delPropietario
    .input(z.object({
      inmuebleId: z.number().int().positive(),
      tipoFacturaId: z.number().int().positive(),
      periodo: z.string().trim().max(10),
      fechaVencimiento: dia,
      valor,
      estado: z.enum(["sin_pagar", "pagado"]).default("sin_pagar"),
      responsable: z.enum(["propietario", "inquilino"]).default("propietario"),
      archivoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [tipo] = await ctx.db
        .select({ periodicidad: tiposFactura.periodicidad, activo: tiposFactura.activo, nombre: tiposFactura.nombre })
        .from(tiposFactura).where(eq(tiposFactura.id, input.tipoFacturaId)).limit(1);
      if (!tipo) throw new TRPCError({ code: "NOT_FOUND", message: "Ese tipo de factura no existe" });
      if (!tipo.activo) throw new TRPCError({ code: "CONFLICT", message: "Ese tipo de factura está anulado" });

      if (!periodoValido(tipo.periodicidad, input.periodo)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El período de ${tipo.nombre} es ${tipo.periodicidad}: ${
            tipo.periodicidad === "mensual" ? "un mes" : tipo.periodicidad === "bimensual" ? "un bimestre" : "un año"}`,
        });
      }
      await validarArchivo(ctx, input.archivoId, input.inmuebleId);

      await ctx.db.insert(facturasPropiedad).values({
        inmuebleId: input.inmuebleId, tipoFacturaId: input.tipoFacturaId, periodo: input.periodo,
        fechaVencimiento: aFecha(input.fechaVencimiento), valor: input.valor.toFixed(2),
        estado: input.estado, responsable: input.responsable,
        archivoId: input.archivoId ?? null, registradaPorId: ctx.usuario.id,
      });
      return { ok: true };
    }),

  /** Registra el pago de una factura: fecha, valor y comprobante. Al hacerlo pasa a pagada. */
  registrarPago: privado
    .input(z.object({
      facturaId: z.number().int().positive(),
      fechaPago: dia,
      valor,
      comprobanteArchivoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const f = await facturaPropia(ctx, input.facturaId);
      if (f.estado === "pagado") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa factura ya está pagada" });
      }
      await validarArchivo(ctx, input.comprobanteArchivoId, f.inmuebleId);

      await ctx.db.update(facturasPropiedad).set({
        estado: "pagado",
        fechaPago: aFecha(input.fechaPago),
        valorPagado: input.valor.toFixed(2),
        comprobanteArchivoId: input.comprobanteArchivoId ?? null,
      }).where(eq(facturasPropiedad.id, input.facturaId));
      return { estado: "pagado" as const };
    }),

  eliminar: privado
    .input(z.object({ facturaId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await facturaPropia(ctx, input.facturaId);
      await ctx.db.delete(facturasPropiedad).where(eq(facturasPropiedad.id, input.facturaId));
      return { ok: true };
    }),
});

/** La factura, si es de una unidad del usuario. */
async function facturaPropia(
  ctx: { db: import("../db/index.js").Database; usuario: { roles: import("../auth/roles.js").RolOtorgado[] } },
  facturaId: number,
) {
  const [f] = await ctx.db
    .select({ inmuebleId: facturasPropiedad.inmuebleId, estado: facturasPropiedad.estado })
    .from(facturasPropiedad).where(eq(facturasPropiedad.id, facturaId)).limit(1);
  if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Esa factura no existe" });
  if (!tieneRol(ctx.usuario.roles, "propietario", "inmueble", f.inmuebleId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esa unidad" });
  }
  return f;
}

/** Un archivo adjunto debe haberse subido para esta misma unidad. */
async function validarArchivo(
  ctx: { db: import("../db/index.js").Database },
  archivoId: number | undefined,
  inmuebleId: number,
) {
  if (archivoId === undefined) return;
  const [a] = await ctx.db.select({ tipo: archivos.entidadTipo, entidad: archivos.entidadId })
    .from(archivos).where(eq(archivos.id, archivoId)).limit(1);
  if (!a || a.tipo !== "factura_propiedad" || a.entidad !== inmuebleId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ese archivo no es de esta unidad" });
  }
}
