import { and, eq, inArray, sql } from "drizzle-orm";
import { router, privado } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { inmuebles } from "../db/schema/inventario.js";
import { contratos } from "../db/schema/contrato.js";
import { facturasArriendo, pagosArriendo, pagosUnidad } from "../db/schema/dinero.js";
import { incidencias } from "../db/schema/operacion.js";
import { aplicaciones } from "../db/schema/demanda.js";

/** El mismo cálculo que hace Mis Ingresos para «este mes»: lo previsto es el
 *  canon de cada unidad arrendada, y lo pagado sale de sus pagos directos
 *  confirmados o de la factura del período — lo que exista. Duplicarlo
 *  acá es lo que evita que el Dashboard muestre $0 cuando la unidad nunca
 *  tuvo una factura emitida pero sí paga por fuera de ese circuito. */
function dentroDelContrato(
  u: { contratoFechaInicio: string | Date | null; contratoFechaFin: string | Date | null }, periodo: string,
): boolean {
  if (u.contratoFechaInicio && periodo < String(u.contratoFechaInicio).slice(0, 7)) return false;
  if (u.contratoFechaFin && periodo > String(u.contratoFechaFin).slice(0, 7)) return false;
  return true;
}

function montoPagadoDelMes(
  inmuebleId: number, canonBase: string, periodo: string,
  facturas: Array<{ inmuebleId: number; periodo: string; total: string; saldo: string }>,
  pagos: Array<{ inmuebleId: number; periodo: string; estado: string; monto: string | null }>,
): number {
  let total = 0;
  for (const f of facturas) {
    if (f.inmuebleId === inmuebleId && f.periodo === periodo) total += Number(f.total) - Number(f.saldo);
  }
  for (const p of pagos) {
    if (p.inmuebleId === inmuebleId && p.periodo === periodo && p.estado === "confirmado") {
      total += p.monto !== null ? Number(p.monto) : Number(canonBase);
    }
  }
  return total;
}

/**
 * Lo primero que ve el propietario al entrar.
 *
 * Responde tres preguntas y no más: cuánto me deben, qué tengo que atender hoy
 * y cómo va el portafolio. Un dashboard que muestra veinte números no se lee;
 * se mira una vez y después se saltea.
 */
export const dashboardRouter = router({
  propietario: privado.query(async ({ ctx }) => {
    const ids = ambitosCon(ctx.usuario.roles, "propietario", "inmueble");
    if (ids.length === 0) {
      return {
        sinUnidades: true as const,
        unidades: { total: 0, arrendadas: 0, publicadas: 0, borrador: 0 },
        dinero: { canonMes: 0, porCobrar: 0, vencido: 0 },
        pendientes: { pagosPorVerificar: 0, aplicacionesPorRevisar: 0, incidenciasAbiertas: 0 },
        alertas: [],
      };
    }

    const misUnidades = await ctx.db
      .select({
        id: inmuebles.id, estado: inmuebles.estado, canonBase: inmuebles.canonBase,
        direccion: inmuebles.direccion, diaPago: inmuebles.diaPago, diasGracia: inmuebles.diasGracia,
        contratoFechaInicio: inmuebles.contratoFechaInicio, contratoFechaFin: inmuebles.contratoFechaFin,
      })
      .from(inmuebles)
      .where(inArray(inmuebles.id, ids));

    const misContratos = await ctx.db
      .select({ id: contratos.id, inmuebleId: contratos.inmuebleId })
      .from(contratos)
      .where(and(inArray(contratos.inmuebleId, ids), eq(contratos.estado, "vigente")));

    const idsContrato = misContratos.map((c) => c.id);

    // Las mismas dos fuentes que usa Mis Ingresos: la factura del período, si
    // la hay, y el pago directo de la unidad — una no sustituye a la otra.
    const facturasDelMes = idsContrato.length === 0 ? [] : await ctx.db
      .select({
        inmuebleId: contratos.inmuebleId, periodo: facturasArriendo.periodo,
        total: facturasArriendo.total, saldo: facturasArriendo.saldo,
      })
      .from(facturasArriendo)
      .innerJoin(contratos, eq(contratos.id, facturasArriendo.contratoId))
      .where(inArray(facturasArriendo.contratoId, idsContrato));

    const pagosDelMes = await ctx.db
      .select({ inmuebleId: pagosUnidad.inmuebleId, periodo: pagosUnidad.periodo, estado: pagosUnidad.estado, monto: pagosUnidad.monto })
      .from(pagosUnidad)
      .where(inArray(pagosUnidad.inmuebleId, ids));

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

    let porCobrar = 0;
    let vencido = 0;
    for (const u of misUnidades) {
      if (u.estado !== "arrendado" || !dentroDelContrato(u, periodo)) continue;
      const previsto = Number(u.canonBase);
      const pagado = montoPagadoDelMes(u.id, u.canonBase, periodo, facturasDelMes, pagosDelMes);
      if (pagado >= previsto) continue;
      porCobrar += previsto;
      const dia = Math.min(u.diaPago, ultimoDiaMes);
      const limite = new Date(hoy.getFullYear(), hoy.getMonth(), dia + u.diasGracia, 23, 59, 59);
      if (hoy > limite) vencido += previsto;
    }

    const [pagos] = idsContrato.length === 0 ? [{ n: 0 }] : await ctx.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(pagosArriendo)
      .where(and(
        inArray(pagosArriendo.contratoId, idsContrato),
        eq(pagosArriendo.estado, "reportado"),
      ));

    const [apps] = await ctx.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(aplicaciones)
      .where(and(
        inArray(aplicaciones.inmuebleId, ids),
        inArray(aplicaciones.estado, ["enviada", "en_verificacion", "en_negociacion"]),
      ));

    const [incid] = await ctx.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(incidencias)
      .where(and(
        inArray(incidencias.inmuebleId, ids),
        inArray(incidencias.estado, ["abierta", "asignada", "en_progreso", "espera_aprobacion"]),
      ));

    // El canon del mes cuenta solo lo arrendado: lo publicado todavía no produce.
    const arrendadas = misUnidades.filter((u) => u.estado === "arrendado");

    return {
      sinUnidades: false as const,
      unidades: {
        total: misUnidades.length,
        arrendadas: arrendadas.length,
        publicadas: misUnidades.filter((u) => u.estado === "publicado").length,
        borrador: misUnidades.filter((u) => u.estado === "borrador").length,
      },
      dinero: {
        canonMes: arrendadas.reduce((t, u) => t + Number(u.canonBase), 0),
        porCobrar,
        vencido,
      },
      pendientes: {
        pagosPorVerificar: Number(pagos?.n ?? 0),
        aplicacionesPorRevisar: Number(apps?.n ?? 0),
        incidenciasAbiertas: Number(incid?.n ?? 0),
      },
      /** Lo que hay que hacer hoy, ya redactado. Cada una lleva a su pantalla. */
      alertas: [
        ...(Number(pagos?.n ?? 0) > 0
          ? [{ clave: "pagos", texto: `${pagos!.n} pago${Number(pagos!.n) === 1 ? "" : "s"} esperando que lo verifiques` }]
          : []),
        ...(Number(apps?.n ?? 0) > 0
          ? [{ clave: "aplicaciones", texto: `${apps!.n} interesado${Number(apps!.n) === 1 ? "" : "s"} sin revisar` }]
          : []),
        ...(vencido > 0
          ? [{ clave: "pagos", texto: "Hay canon vencido sin pagar" }]
          : []),
        ...(Number(incid?.n ?? 0) > 0
          ? [{ clave: "incidencias", texto: `${incid!.n} incidencia${Number(incid!.n) === 1 ? "" : "s"} abierta${Number(incid!.n) === 1 ? "" : "s"}` }]
          : []),
        ...(misUnidades.some((u) => u.estado === "borrador")
          ? [{ clave: "portafolio", texto: "Tenés unidades en borrador sin publicar" }]
          : []),
      ],
    };
  }),
});
