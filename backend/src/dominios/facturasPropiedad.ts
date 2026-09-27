import { z } from "zod";
import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { ambitosCon, tieneRol, type RolOtorgado } from "../auth/roles.js";
import { inmuebles, edificaciones } from "../db/schema/inventario.js";
import { archivos } from "../db/schema/identidad.js";
import { facturasPropiedad, tiposFactura } from "../db/schema/facturasPropiedad.js";
import { sincronizarGasto } from "./gastoDeFactura.js";

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
const hoy = () => new Date().toISOString().slice(0, 10);
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
        requiereReferencia: tiposFactura.requiereReferencia,
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
        motivoAnulacion: facturasPropiedad.motivoAnulacion,
        anuladaAt: facturasPropiedad.anuladaAt,
        responsable: facturasPropiedad.responsable,
        prorrateo: facturasPropiedad.prorrateo,
        numeroMedidor: facturasPropiedad.numeroMedidor,
        referenciaPago: facturasPropiedad.referenciaPago,
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
      situacion: f.estado === "anulada" ? "anulada" as const
        : f.estado === "pagado" ? "pagada" as const
        : new Date(f.fechaVencimiento) < hoy ? "vencida" as const : "pendiente" as const,
    }));

    const suma = (fn: (f: (typeof facturas)[number]) => boolean) =>
      facturas.filter(fn).reduce((t, f) => t + Number(f.valor), 0);

    return {
      total: facturas.length,
      facturas,
      sinPagar: suma((f) => f.situacion === "pendiente" || f.situacion === "vencida"),
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
      referenciaPago: z.string().trim().max(60).optional(),
      /** Cómo se reparte entre las unidades si la factura es de la edificación. */
      prorrateo: z.enum(["partes_iguales", "por_area", "por_canon"]).optional(),
      /** Solo si se registra ya pagada: el pago. */
      fechaPago: dia.optional(),
      valorPagado: valor.optional(),
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
          requiereMedidor: tiposFactura.requiereMedidor, requiereReferencia: tiposFactura.requiereReferencia,
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
      if (tipo.requiereReferencia && !input.referenciaPago) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `La factura de ${tipo.nombre.toLowerCase()} necesita la referencia de pago` });
      }
      await validarArchivo(ctx, input.archivoId, donde);

      if (donde.edificacionId !== null && !input.prorrateo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Elegí cómo se reparte entre las unidades" });
      }
      const pagada = input.estado === "pagado";
      await ctx.db.transaction(async (tx) => {
      const [nueva] = await tx.insert(facturasPropiedad).values({
        inmuebleId: donde.inmuebleId, edificacionId: donde.edificacionId, tipoFacturaId: input.tipoFacturaId, periodo: input.periodo,
        fechaVencimiento: aFecha(input.fechaVencimiento), valor: input.valor.toFixed(2),
        estado: input.estado, responsable: input.responsable,
        prorrateo: donde.edificacionId !== null ? input.prorrateo! : "ninguno",
        fechaPago: pagada ? aFecha(input.fechaPago ?? hoy()) : null,
        valorPagado: pagada ? (input.valorPagado ?? input.valor).toFixed(2) : null,
        numeroMedidor: tipo.requiereMedidor ? input.numeroMedidor! : null,
        referenciaPago: tipo.requiereReferencia ? input.referenciaPago! : null,
        archivoId: input.archivoId ?? null, registradaPorId: ctx.usuario.id,
      }).$returningId();
      await sincronizarGasto(tx, nueva!.id);
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
      if (f.estado === "anulada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa factura está anulada" });
      }
      if (f.estado === "pagado") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa factura ya está pagada" });
      }
      await validarArchivo(ctx, input.comprobanteArchivoId, f);

      await ctx.db.transaction(async (tx) => {
        await tx.update(facturasPropiedad).set({
          estado: "pagado",
          fechaPago: aFecha(input.fechaPago),
          valorPagado: input.valor.toFixed(2),
          comprobanteArchivoId: input.comprobanteArchivoId ?? null,
        }).where(eq(facturasPropiedad.id, input.facturaId));
        await sincronizarGasto(tx, input.facturaId);
      });
      return { estado: "pagado" as const };
    }),

  /**
   * Corrige una factura registrada: período, vencimiento, valor, responsable,
   * medidor, referencia, el archivo y el pago. El tipo y el sitio (unidad o
   * edificación) no se cambian: cambiarlos rompería las reglas del tipo —su
   * período, su medidor— y, si se equivocó ahí, lo correcto es anularla y
   * registrar otra. Una anulada no se edita.
   */
  editar: privado
    .input(z.object({
      facturaId: z.number().int().positive(),
      periodo: z.string().trim().max(10).optional(),
      fechaVencimiento: dia.optional(),
      valor: valor.optional(),
      responsable: z.enum(["propietario", "inquilino"]).optional(),
      prorrateo: z.enum(["partes_iguales", "por_area", "por_canon"]).optional(),
      numeroMedidor: z.string().trim().max(40).optional(),
      referenciaPago: z.string().trim().max(60).optional(),
      archivoId: z.number().int().positive().optional(),
      estado: z.enum(["sin_pagar", "pagado"]).optional(),
      fechaPago: dia.optional(),
      valorPagado: valor.optional(),
      comprobanteArchivoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [f] = await ctx.db
        .select({
          inmuebleId: facturasPropiedad.inmuebleId, edificacionId: facturasPropiedad.edificacionId,
          estado: facturasPropiedad.estado, numeroMedidor: facturasPropiedad.numeroMedidor,
          referenciaPago: facturasPropiedad.referenciaPago, fechaPago: facturasPropiedad.fechaPago,
          valorPagado: facturasPropiedad.valorPagado, valor: facturasPropiedad.valor,
          periodicidad: tiposFactura.periodicidad, requiereMedidor: tiposFactura.requiereMedidor,
          requiereReferencia: tiposFactura.requiereReferencia, tipo: tiposFactura.nombre,
        })
        .from(facturasPropiedad)
        .innerJoin(tiposFactura, eq(tiposFactura.id, facturasPropiedad.tipoFacturaId))
        .where(eq(facturasPropiedad.id, input.facturaId)).limit(1);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Esa factura no existe" });
      exigirSitio(ctx.usuario.roles, f);
      if (f.estado === "anulada") {
        throw new TRPCError({ code: "CONFLICT", message: "Una factura anulada no se edita" });
      }

      if (input.periodo !== undefined && !periodoValido(f.periodicidad, input.periodo)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `El período de ${f.tipo} es ${f.periodicidad}` });
      }
      const medidor = input.numeroMedidor ?? f.numeroMedidor ?? "";
      if (f.requiereMedidor && medidor.trim() === "") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `La factura de ${f.tipo.toLowerCase()} necesita el número de medidor` });
      }
      const referencia = input.referenciaPago ?? f.referenciaPago ?? "";
      if (f.requiereReferencia && referencia.trim() === "") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `La factura de ${f.tipo.toLowerCase()} necesita la referencia de pago` });
      }
      await validarArchivo(ctx, input.archivoId, f);
      await validarArchivo(ctx, input.comprobanteArchivoId, f);

      const estadoFinal = input.estado ?? f.estado;
      const cambios: Record<string, unknown> = {};
      if (input.periodo !== undefined) cambios["periodo"] = input.periodo;
      if (input.fechaVencimiento !== undefined) cambios["fechaVencimiento"] = aFecha(input.fechaVencimiento);
      if (input.valor !== undefined) cambios["valor"] = input.valor.toFixed(2);
      if (input.responsable !== undefined) cambios["responsable"] = input.responsable;
      if (input.prorrateo !== undefined && f.edificacionId !== null) cambios["prorrateo"] = input.prorrateo;
      if (f.requiereMedidor) cambios["numeroMedidor"] = medidor.trim();
      if (f.requiereReferencia) cambios["referenciaPago"] = referencia.trim();
      if (input.archivoId !== undefined) cambios["archivoId"] = input.archivoId;

      if (estadoFinal === "sin_pagar") {
        // Volver a sin pagar borra el pago: no puede quedar un comprobante de algo no pagado.
        Object.assign(cambios, { estado: "sin_pagar", fechaPago: null, valorPagado: null, comprobanteArchivoId: null });
      } else {
        const fechaPago = input.fechaPago ?? (f.fechaPago ? new Date(f.fechaPago).toISOString().slice(0, 10) : undefined);
        const valorPagado = input.valorPagado ?? (f.valorPagado !== null ? Number(f.valorPagado) : undefined);
        if (fechaPago === undefined || valorPagado === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Para dejarla pagada hace falta la fecha y el valor del pago" });
        }
        Object.assign(cambios, { estado: "pagado", fechaPago: aFecha(fechaPago), valorPagado: valorPagado.toFixed(2) });
        if (input.comprobanteArchivoId !== undefined) cambios["comprobanteArchivoId"] = input.comprobanteArchivoId;
      }

      await ctx.db.transaction(async (tx) => {
        await tx.update(facturasPropiedad).set(cambios).where(eq(facturasPropiedad.id, input.facturaId));
        await sincronizarGasto(tx, input.facturaId);
      });
      return { ok: true };
    }),

  /** Vuelve a generar los gastos de todas mis facturas: para las que se pagaron antes de que el gasto naciera solo. */
  sincronizarGastos: privado.mutation(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    const eds = [
      ...ambitosCon(ctx.usuario.roles, "propietario", "edificacion"),
      ...ambitosCon(ctx.usuario.roles, "administrador_inmueble", "edificacion"),
    ];
    const donde = or(
      ...(ids.length > 0 ? [inArray(facturasPropiedad.inmuebleId, ids)] : []),
      ...(eds.length > 0 ? [inArray(facturasPropiedad.edificacionId, eds)] : []),
    );
    if (ids.length === 0 && eds.length === 0) return { revisadas: 0 };
    const filas = await ctx.db.select({ id: facturasPropiedad.id }).from(facturasPropiedad).where(donde);
    await ctx.db.transaction(async (tx) => {
      for (const f of filas) await sincronizarGasto(tx, f.id);
    });
    return { revisadas: filas.length };
  }),

  /**
   * Anula una factura, con su motivo. No se borra: una factura registrada es
   * un rastro de plata, y anularla la deja a la vista sin contarla en los
   * totales. Sirve tanto para una registrada por error como para una
   * pagada que se cargó mal.
   */
  anular: privado
    .input(z.object({
      facturaId: z.number().int().positive(),
      motivo: z.string().trim().min(4, "Contá por qué se anula").max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const f = await facturaPropia(ctx, input.facturaId);
      if (f.estado === "anulada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa factura ya está anulada" });
      }
      await ctx.db.transaction(async (tx) => {
        await tx.update(facturasPropiedad).set({
          estado: "anulada", motivoAnulacion: input.motivo,
          anuladaAt: new Date(), anuladaPorId: ctx.usuario.id,
        }).where(eq(facturasPropiedad.id, input.facturaId));
        await sincronizarGasto(tx, input.facturaId);
      });
      return { estado: "anulada" as const };
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
