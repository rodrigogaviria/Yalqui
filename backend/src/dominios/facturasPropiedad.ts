import { z } from "zod";
import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { ambitosCon, tieneRol, type RolOtorgado } from "../auth/roles.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { archivos } from "../db/schema/identidad.js";
import { facturasPropiedad, tiposFactura } from "../db/schema/facturasPropiedad.js";

/** Quien manda sobre la edificación: su dueño o su administrador. */
export const puedeSobreEdificacion = (roles: RolOtorgado[], edificacionId: number) =>
  tieneRol(roles, "propietario", "edificacion", edificacionId)
  || tieneRol(roles, "administrador_inmueble", "edificacion", edificacionId);

type Sitio = { inmuebleId: number | null; edificacionId: number | null };

function exigirSitio(roles: RolOtorgado[], s: Sitio) {
  const puede = s.inmuebleId !== null
    ? tieneRol(roles, "propietario", "inmueble", s.inmuebleId)
    : s.edificacionId !== null && puedeSobreEdificacion(roles, s.edificacionId);
  if (!puede) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
}

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
        requiereMedidor: tiposFactura.requiereMedidor,
      })
      .from(tiposFactura)
      .where(eq(tiposFactura.activo, true))
      .orderBy(asc(tiposFactura.orden), asc(tiposFactura.nombre)),
  ),

  mias: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    const eds = [
      ...ambitosCon(ctx.usuario.roles, "propietario", "edificacion"),
      ...ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion"),
    ];
    if (ids.length === 0 && eds.length === 0) return { total: 0, facturas: [], sinPagar: 0, vencido: 0, pagado: 0 };

    const filas = await ctx.db
      .select({
        id: facturasPropiedad.id,
        inmuebleId: facturasPropiedad.inmuebleId,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        edificacionId: facturasPropiedad.edificacionId,
        edificacion: edificaciones.nombre,
        tipo: tiposFactura.nombre,
        categoria: tiposFactura.categoria,
        periodicidad: tiposFactura.periodicidad,
        periodo: facturasPropiedad.periodo,
        fechaVencimiento: facturasPropiedad.fechaVencimiento,
        valor: facturasPropiedad.valor,
        estado: facturasPropiedad.estado,
        responsable: facturasPropiedad.responsable,
        numeroMedidor: facturasPropiedad.numeroMedidor,
        archivoId: facturasPropiedad.archivoId,
        fechaPago: facturasPropiedad.fechaPago,
        valorPagado: facturasPropiedad.valorPagado,
        comprobanteArchivoId: facturasPropiedad.comprobanteArchivoId,
      })
      .from(facturasPropiedad)
      .leftJoin(inmuebles, eq(inmuebles.id, facturasPropiedad.inmuebleId))
      .leftJoin(edificaciones, eq(edificaciones.id, facturasPropiedad.edificacionId))
      .innerJoin(tiposFactura, eq(tiposFactura.id, facturasPropiedad.tipoFacturaId))
      .where(or(
        ...(ids.length > 0 ? [inArray(facturasPropiedad.inmuebleId, ids)] : []),
        ...(eds.length > 0 ? [inArray(facturasPropiedad.edificacionId, eds)] : []),
      ))
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

  registrar: privado
    .input(z.object({
      inmuebleId: z.number().int().positive().optional(),
      edificacionId: z.number().int().positive().optional(),
      tipoFacturaId: z.number().int().positive(),
      periodo: z.string().trim().max(10),
      fechaVencimiento: dia,
      valor,
      estado: z.enum(["sin_pagar", "pagado"]).default("sin_pagar"),
      responsable: z.enum(["propietario", "inquilino"]).default("propietario"),
      numeroMedidor: z.string().trim().max(40).optional(),
      archivoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((input.inmuebleId === undefined) === (input.edificacionId === undefined)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Decí si la factura es de una unidad o de la edificación" });
      }
      const donde: Sitio = { inmuebleId: input.inmuebleId ?? null, edificacionId: input.edificacionId ?? null };
      exigirSitio(ctx.usuario.roles, donde);
      const [tipo] = await ctx.db
        .select({
          periodicidad: tiposFactura.periodicidad, activo: tiposFactura.activo, nombre: tiposFactura.nombre,
          requiereMedidor: tiposFactura.requiereMedidor,
        })
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
      if (tipo.requiereMedidor && !input.numeroMedidor) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `La factura de ${tipo.nombre.toLowerCase()} necesita el número de medidor` });
      }
      await validarArchivo(ctx, input.archivoId, donde);

      await ctx.db.insert(facturasPropiedad).values({
        inmuebleId: donde.inmuebleId, edificacionId: donde.edificacionId, tipoFacturaId: input.tipoFacturaId, periodo: input.periodo,
        fechaVencimiento: aFecha(input.fechaVencimiento), valor: input.valor.toFixed(2),
        estado: input.estado, responsable: input.responsable,
        numeroMedidor: tipo.requiereMedidor ? input.numeroMedidor! : null,
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
      await validarArchivo(ctx, input.comprobanteArchivoId, f);

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

/** La factura, si es de una unidad o edificación sobre las que el usuario manda. */
async function facturaPropia(
  ctx: { db: import("../db/index.js").Database; usuario: { roles: RolOtorgado[] } },
  facturaId: number,
) {
  const [f] = await ctx.db
    .select({
      inmuebleId: facturasPropiedad.inmuebleId, edificacionId: facturasPropiedad.edificacionId,
      estado: facturasPropiedad.estado,
    })
    .from(facturasPropiedad).where(eq(facturasPropiedad.id, facturaId)).limit(1);
  if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Esa factura no existe" });
  exigirSitio(ctx.usuario.roles, f);
  return f;
}

/** Un archivo adjunto debe haberse subido para este mismo sitio. */
async function validarArchivo(
  ctx: { db: import("../db/index.js").Database },
  archivoId: number | undefined,
  s: Sitio,
) {
  if (archivoId === undefined) return;
  const [a] = await ctx.db.select({ tipo: archivos.entidadTipo, entidad: archivos.entidadId })
    .from(archivos).where(eq(archivos.id, archivoId)).limit(1);
  const esperado = s.inmuebleId !== null
    ? { tipo: "factura_propiedad", entidad: s.inmuebleId }
    : { tipo: "factura_edificacion", entidad: s.edificacionId };
  if (!a || a.tipo !== esperado.tipo || a.entidad !== esperado.entidad) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ese archivo no es de este sitio" });
  }
}
