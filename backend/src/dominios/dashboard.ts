import { and, eq, inArray, sql } from "drizzle-orm";
import { router, privado } from "../trpc/base.js";
import { ambitosCon } from "../auth/roles.js";
import { inmuebles } from "../db/schema/inventario.js";
import { contratos } from "../db/schema/contrato.js";
import { facturasArriendo, pagosArriendo } from "../db/schema/dinero.js";
import { incidencias } from "../db/schema/operacion.js";
import { aplicaciones } from "../db/schema/demanda.js";

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
      .select({ id: inmuebles.id, estado: inmuebles.estado, canonBase: inmuebles.canonBase,
                direccion: inmuebles.direccion })
      .from(inmuebles)
      .where(inArray(inmuebles.id, ids));

    const misContratos = await ctx.db
      .select({ id: contratos.id, inmuebleId: contratos.inmuebleId })
      .from(contratos)
      .where(and(inArray(contratos.inmuebleId, ids), eq(contratos.estado, "vigente")));

    const idsContrato = misContratos.map((c) => c.id);

    const facturas = idsContrato.length === 0 ? [] : await ctx.db
      .select({
        saldo: facturasArriendo.saldo,
        fechaVencimiento: facturasArriendo.fechaVencimiento,
        periodo: facturasArriendo.periodo,
        contratoId: facturasArriendo.contratoId,
      })
      .from(facturasArriendo)
      .where(inArray(facturasArriendo.contratoId, idsContrato));

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const pendientes = facturas.filter((f) => Number(f.saldo) > 0);
    const porCobrar = pendientes.reduce((t, f) => t + Number(f.saldo), 0);
    const vencido = pendientes
      .filter((f) => new Date(f.fechaVencimiento) < hoy)
      .reduce((t, f) => t + Number(f.saldo), 0);

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
