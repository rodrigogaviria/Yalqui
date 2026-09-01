import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, privado } from "../trpc/base.js";
import { facturasArriendo, facturaArriendoConceptos, pagosArriendo } from "../db/schema/dinero.js";
import { contratos, contratoAjustes } from "../db/schema/contrato.js";
import { catalogoAjustes, inmuebles } from "../db/schema/inventario.js";

const dinero = z.number().positive().max(999_999_999);

/** Quien manda sobre el contrato: el dueño del inmueble o un admin. */
async function exigirPropietarioDelContrato(ctx: any, contratoId: number) {
  const [c] = await ctx.db.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Ese contrato no existe" });

  const puede = ctx.usuario.roles.some(
    (r: any) => r.rol === "propietario" && r.ambitoTipo === "inmueble" && r.ambitoId === c.inmuebleId,
  ) || ctx.usuario.roles.some((r: any) => r.rol === "admin_yalqui");
  if (!puede) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre ese contrato" });
  return c;
}

export const facturacionRouter = router({
  /**
   * Emite la factura del periodo, desglosada línea por línea.
   *
   * El inquilino no recibe «arriendo: $2.720.000». Recibe el canon, cada ajuste
   * con su nombre y la administración por separado. Es lo que permite discutir
   * una línea sin renegociar el contrato entero.
   */
  emitir: privado
    .input(z.object({
      contratoId: z.number().int().positive(),
      periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato AAAA-MM"),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await exigirPropietarioDelContrato(ctx, input.contratoId);
      if (c.estado !== "vigente") {
        throw new TRPCError({ code: "CONFLICT", message: "Solo se factura un contrato vigente" });
      }

      const ya = await ctx.db.select({ id: facturasArriendo.id }).from(facturasArriendo)
        .where(and(eq(facturasArriendo.contratoId, input.contratoId),
                   eq(facturasArriendo.periodo, input.periodo))).limit(1);
      if (ya.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Ya existe la factura de ${input.periodo}` });
      }

      const [anio, mes] = input.periodo.split("-").map(Number);
      const vencimiento = new Date(Date.UTC(anio!, mes! - 1, c.diaPago));

      // Solo los ajustes vigentes en el periodo: una mascota que llegó en marzo
      // no se cobra en febrero.
      const ajustes = await ctx.db
        .select({
          id: contratoAjustes.id, cantidad: contratoAjustes.cantidad,
          valorTotal: contratoAjustes.valorTotal, desde: contratoAjustes.vigenteDesde,
          hasta: contratoAjustes.vigenteHasta, nombre: catalogoAjustes.nombre,
        })
        .from(contratoAjustes)
        .innerJoin(catalogoAjustes, eq(catalogoAjustes.id, contratoAjustes.ajusteId))
        .where(and(eq(contratoAjustes.contratoId, input.contratoId),
                   eq(contratoAjustes.periodicidad, "mensual")));

      const finPeriodo = new Date(Date.UTC(anio!, mes!, 0));
      const vigentes = ajustes.filter(
        (a) => (!a.desde || a.desde <= finPeriodo) && (!a.hasta || a.hasta >= vencimiento),
      );

      type Concepto = {
        concepto: "canon" | "ajuste" | "administracion";
        contratoAjusteId: number | null;
        descripcion: string;
        valor: number;
      };
      const conceptos: Concepto[] = [
        { concepto: "canon", contratoAjusteId: null, descripcion: "Canon base", valor: Number(c.canonMensual) },
        ...vigentes.map((a) => ({
          concepto: "ajuste" as const, contratoAjusteId: a.id as number | null,
          descripcion: a.cantidad > 1 ? `${a.nombre} × ${a.cantidad}` : a.nombre,
          valor: Number(a.valorTotal),
        })),
      ];
      if (!c.administracionIncluida && Number(c.valorAdministracion) > 0) {
        conceptos.push({
          concepto: "administracion", contratoAjusteId: null,
          descripcion: "Administración", valor: Number(c.valorAdministracion),
        });
      }

      const total = conceptos.reduce((t, x) => t + x.valor, 0);

      const facturaId = await ctx.db.transaction(async (tx) => {
        const [res] = await tx.insert(facturasArriendo).values({
          contratoId: input.contratoId, periodo: input.periodo,
          fechaEmision: new Date(), fechaVencimiento: vencimiento,
          subtotal: total.toFixed(2), mora: "0.00",
          total: total.toFixed(2), saldo: total.toFixed(2),
          estado: "emitida", diasMora: 0,
        });
        const id = Number((res as { insertId: number }).insertId);
        await tx.insert(facturaArriendoConceptos).values(conceptos.map((x) => ({
          facturaId: id, concepto: x.concepto, contratoAjusteId: x.contratoAjusteId,
          descripcion: x.descripcion, valor: x.valor.toFixed(2),
        })));
        return id;
      });

      return { facturaId, periodo: input.periodo, total, conceptos: conceptos.length };
    }),

  /** Lo que el inquilino debe, con su desglose. */
  miEstadoDeCuenta: privado.query(async ({ ctx }) => {
    const contratosMios = ctx.usuario.roles
      .filter((r) => r.rol === "inquilino" && r.ambitoTipo === "contrato")
      .map((r) => r.ambitoId);
    if (contratosMios.length === 0) return { total: 0, facturas: [] };

    const filas = await ctx.db
      .select({
        id: facturasArriendo.id, periodo: facturasArriendo.periodo,
        total: facturasArriendo.total, saldo: facturasArriendo.saldo,
        estado: facturasArriendo.estado, fechaVencimiento: facturasArriendo.fechaVencimiento,
        direccion: inmuebles.direccion,
      })
      .from(facturasArriendo)
      .innerJoin(contratos, eq(contratos.id, facturasArriendo.contratoId))
      .innerJoin(inmuebles, eq(inmuebles.id, contratos.inmuebleId))
      .where(inArray(facturasArriendo.contratoId, contratosMios))
      .orderBy(desc(facturasArriendo.periodo));

    return { total: filas.length, facturas: filas };
  }),

  /** El desglose de una factura. Cada línea con su origen. */
  detalle: privado
    .input(z.object({ facturaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [f] = await ctx.db.select().from(facturasArriendo)
        .where(eq(facturasArriendo.id, input.facturaId)).limit(1);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Esa factura no existe" });

      const [c] = await ctx.db.select().from(contratos).where(eq(contratos.id, f.contratoId)).limit(1);
      const esParte = c && (c.inquilinoId === ctx.usuario.id || c.propietarioId === ctx.usuario.id);
      if (!esParte && !ctx.usuario.roles.some((r) => r.rol === "admin_yalqui")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa factura no es tuya" });
      }

      const conceptos = await ctx.db.select().from(facturaArriendoConceptos)
        .where(eq(facturaArriendoConceptos.facturaId, input.facturaId));
      return { factura: f, conceptos };
    }),

  /**
   * El inquilino reporta que pagó.
   *
   * Yalqui no recauda: la plata fue directo al propietario. Esto es un
   * comprobante con estado, no una transacción — y por eso el saldo NO se mueve
   * todavía.
   */
  reportarPago: privado
    .input(z.object({
      facturaId: z.number().int().positive(),
      monto: dinero,
      fechaPagoDeclarada: z.coerce.date(),
      canal: z.enum(["link_pago", "transferencia", "consignacion", "efectivo", "otro"]),
      bancoOrigen: z.string().trim().max(80).optional(),
      referenciaExterna: z.string().trim().max(120).optional(),
      comprobanteArchivoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [f] = await ctx.db.select().from(facturasArriendo)
        .where(eq(facturasArriendo.id, input.facturaId)).limit(1);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Esa factura no existe" });
      if (f.estado === "pagada") {
        throw new TRPCError({ code: "CONFLICT", message: "Esa factura ya está pagada" });
      }

      const [c] = await ctx.db.select({ inquilinoId: contratos.inquilinoId })
        .from(contratos).where(eq(contratos.id, f.contratoId)).limit(1);
      if (!c || c.inquilinoId !== ctx.usuario.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esa factura no es tuya" });
      }
      // Transferencia y consignación no se pueden confirmar solas: sin
      // comprobante el propietario no tiene contra qué verificar.
      if (input.canal !== "link_pago" && input.comprobanteArchivoId === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ese medio de pago necesita comprobante" });
      }

      const [res] = await ctx.db.insert(pagosArriendo).values({
        facturaId: input.facturaId, contratoId: f.contratoId,
        reportadoPorId: ctx.usuario.id, monto: input.monto.toFixed(2),
        fechaPagoDeclarada: input.fechaPagoDeclarada, canal: input.canal,
        bancoOrigen: input.bancoOrigen ?? null,
        referenciaExterna: input.referenciaExterna ?? null,
        comprobanteArchivoId: input.comprobanteArchivoId ?? null,
        estado: "reportado",
      });

      return {
        pagoId: Number((res as { insertId: number }).insertId),
        estado: "reportado" as const,
        aviso: "Tu saldo sigue igual hasta que el arrendador verifique el comprobante.",
      };
    }),

  /** La bandeja del propietario: lo que espera confirmación. */
  /**
   * Las facturas de las unidades del propietario.
   *
   * Devuelve el estado tal como lo necesita el calendario: vencida, pagada o
   * todavía por llegar. La mora se calcula contra hoy y no se lee de la fila,
   * porque `dias_mora` solo se actualiza cuando algo toca la factura y una
   * factura que nadie tocó en dos meses seguiría diciendo cero.
   */
  misFacturas: privado.query(async ({ ctx }) => {
    const ids = ctx.usuario.roles
      .filter((r) => r.rol === "propietario" && r.ambitoTipo === "inmueble")
      .map((r) => r.ambitoId);
    if (ids.length === 0) {
      return { total: 0, facturas: [], porCobrar: 0, vencido: 0 };
    }

    const filas = await ctx.db
      .select({
        id: facturasArriendo.id,
        periodo: facturasArriendo.periodo,
        total: facturasArriendo.total,
        saldo: facturasArriendo.saldo,
        estado: facturasArriendo.estado,
        fechaVencimiento: facturasArriendo.fechaVencimiento,
        inmuebleId: inmuebles.id,
        direccion: inmuebles.direccion,
        complemento: inmuebles.complemento,
        contratoId: contratos.id,
      })
      .from(facturasArriendo)
      .innerJoin(contratos, eq(contratos.id, facturasArriendo.contratoId))
      .innerJoin(inmuebles, eq(inmuebles.id, contratos.inmuebleId))
      .where(inArray(inmuebles.id, ids))
      .orderBy(desc(facturasArriendo.periodo));

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const facturas = filas.map((f) => {
      const vence = new Date(f.fechaVencimiento);
      const pagada = Number(f.saldo) <= 0;
      const situacion = pagada ? "pagada" : vence < hoy ? "vencida" : "porVencer";
      const diasMora = situacion === "vencida"
        ? Math.floor((hoy.getTime() - vence.getTime()) / 86_400_000)
        : 0;
      return { ...f, situacion, diasMora };
    });

    const porCobrar = facturas
      .filter((f) => f.situacion !== "pagada")
      .reduce((t, f) => t + Number(f.saldo), 0);
    const vencido = facturas
      .filter((f) => f.situacion === "vencida")
      .reduce((t, f) => t + Number(f.saldo), 0);

    return { total: facturas.length, facturas, porCobrar, vencido };
  }),

  porVerificar: privado.query(async ({ ctx }) => {
    const ids = ctx.usuario.roles
      .filter((r) => r.rol === "propietario" && r.ambitoTipo === "inmueble")
      .map((r) => r.ambitoId);
    if (ids.length === 0) return { total: 0, pagos: [] };

    const filas = await ctx.db
      .select({
        id: pagosArriendo.id, monto: pagosArriendo.monto, canal: pagosArriendo.canal,
        fechaPagoDeclarada: pagosArriendo.fechaPagoDeclarada,
        comprobanteArchivoId: pagosArriendo.comprobanteArchivoId,
        createdAt: pagosArriendo.createdAt,
        periodo: facturasArriendo.periodo, totalFactura: facturasArriendo.total,
        direccion: inmuebles.direccion, inmuebleId: inmuebles.id,
      })
      .from(pagosArriendo)
      .innerJoin(facturasArriendo, eq(facturasArriendo.id, pagosArriendo.facturaId))
      .innerJoin(contratos, eq(contratos.id, pagosArriendo.contratoId))
      .innerJoin(inmuebles, eq(inmuebles.id, contratos.inmuebleId))
      .where(eq(pagosArriendo.estado, "reportado"));

    const mios = filas.filter((p) => ids.includes(p.inmuebleId));
    return { total: mios.length, pagos: mios };
  }),

  /**
   * El propietario confirma o rechaza.
   *
   * Solo `verificado` mueve el saldo y detiene la cobranza. Rechazar deja la
   * factura como estaba: no la anula, le pide el soporte correcto al inquilino.
   */
  verificarPago: privado
    .input(z.object({
      pagoId: z.number().int().positive(),
      decision: z.enum(["verificado", "rechazado"]),
      motivo: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db.select().from(pagosArriendo)
        .where(eq(pagosArriendo.id, input.pagoId)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ese pago no existe" });
      if (p.estado !== "reportado" && p.estado !== "en_verificacion") {
        throw new TRPCError({ code: "CONFLICT", message: "Ese pago ya fue resuelto" });
      }
      await exigirPropietarioDelContrato(ctx, p.contratoId);

      if (input.decision === "rechazado") {
        if (!input.motivo?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Un rechazo necesita motivo" });
        }
        await ctx.db.update(pagosArriendo).set({
          estado: "rechazado", verificadoPorId: ctx.usuario.id,
          verificadoAt: new Date(), motivoRechazo: input.motivo,
        }).where(eq(pagosArriendo.id, input.pagoId));
        return { estado: "rechazado" as const, saldoMovido: false };
      }

      const resultado = await ctx.db.transaction(async (tx) => {
        await tx.update(pagosArriendo).set({
          estado: "verificado", verificadoComo: "manual",
          verificadoPorId: ctx.usuario.id, verificadoAt: new Date(),
        }).where(eq(pagosArriendo.id, input.pagoId));

        const [f] = await tx.select().from(facturasArriendo)
          .where(eq(facturasArriendo.id, p.facturaId)).limit(1);
        const saldo = Number(f!.saldo) - Number(p.monto);
        const nuevo = Math.max(0, saldo);

        await tx.update(facturasArriendo).set({
          saldo: nuevo.toFixed(2),
          estado: nuevo === 0 ? "pagada" : "parcial",
        }).where(eq(facturasArriendo.id, p.facturaId));

        return { saldo: nuevo, estadoFactura: nuevo === 0 ? "pagada" : "parcial" };
      });

      return { estado: "verificado" as const, saldoMovido: true, ...resultado };
    }),
});
