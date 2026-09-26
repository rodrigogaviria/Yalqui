import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { dimensionesScore, eventosScore } from "../db/schema/score.js";
import { aplicaciones } from "../db/schema/demanda.js";
import { pagosUnidad } from "../db/schema/dinero.js";
import { inmuebles } from "../db/schema/inventario.js";

export type NivelScore = "excelente" | "bueno" | "regular" | "riesgo" | "critico";

/** De qué puntaje a qué nivel. Debajo de 40 ya no es un riesgo, es un problema. */
export function nivelDe(puntaje: number): NivelScore {
  if (puntaje >= 85) return "excelente";
  if (puntaje >= 70) return "bueno";
  if (puntaje >= 55) return "regular";
  if (puntaje >= 40) return "riesgo";
  return "critico";
}

/** Cuánto suma o resta un pago según llegó a tiempo o no. Pagar tarde pesa
 *  más de lo que pesa pagar bien: la confianza se pierde más rápido de lo
 *  que se gana. */
export const IMPACTO_PAGO_PUNTUAL = 1.5;
export const IMPACTO_PAGO_TARDIO = -5;

const acota = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Un pago es puntual si se hizo hasta el día previsto más los días de gracia
 * de la unidad, en el mes que corresponde.
 */
export function pagoEsPuntual(
  periodo: string, fechaPago: Date, diaPago: number, diasGracia: number,
): boolean {
  const [anio, mes] = periodo.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio!, mes!, 0)).getUTCDate();
  const limite = new Date(Date.UTC(anio!, mes! - 1, Math.min(diaPago, ultimo) + diasGracia, 23, 59, 59));
  return fechaPago <= limite;
}

export interface ResultadoScore {
  puntaje: number;
  nivel: NivelScore;
  /** Sin ningún hecho registrado el puntaje es el punto de partida, no una nota. */
  sinHistorial: boolean;
  eventos: number;
  dimensiones: Array<{ codigo: string; nombre: string; puntaje: number; peso: number }>;
}

/**
 * El score de cada persona, calculado en el momento.
 *
 * Cada dimensión parte de su puntaje base y se mueve con los hechos vigentes:
 * los eventos de `eventos_score` (los que registre cualquier proceso) y, por
 * ahora, los pagos de unidad confirmados por el propietario, que se leen
 * directo para que el score ya refleje lo que pasa sin esperar a que otro
 * proceso escriba eventos. El global es el promedio ponderado por los pesos
 * de las dimensiones activas.
 */
export async function calcularScores(db: Database, usuarioIds: number[]): Promise<Map<number, ResultadoScore>> {
  const salida = new Map<number, ResultadoScore>();
  if (usuarioIds.length === 0) return salida;

  const dims = (await db.select().from(dimensionesScore)
    .where(and(eq(dimensionesScore.activo, true), isNull(dimensionesScore.vigenteHasta))))
    .sort((a, b) => a.orden - b.orden);
  const idPagos = dims.find((d) => d.codigo === "pagos")?.id;

  const eventos = await db.select({
    inquilinoId: eventosScore.inquilinoId, dimensionId: eventosScore.dimensionId, impacto: eventosScore.impacto,
  }).from(eventosScore)
    .where(and(inArray(eventosScore.inquilinoId, usuarioIds), eq(eventosScore.estado, "vigente")));

  // Pagos confirmados de las unidades donde la persona es la arrendataria.
  const pagos = await db.select({
    inquilinoId: aplicaciones.inquilinoId, periodo: pagosUnidad.periodo, fechaPago: pagosUnidad.fechaPago,
    diaPago: inmuebles.diaPago, diasGracia: inmuebles.diasGracia,
  }).from(pagosUnidad)
    .innerJoin(aplicaciones, and(
      eq(aplicaciones.inmuebleId, pagosUnidad.inmuebleId), eq(aplicaciones.estado, "aprobada"),
    ))
    .innerJoin(inmuebles, eq(inmuebles.id, pagosUnidad.inmuebleId))
    .where(and(inArray(aplicaciones.inquilinoId, usuarioIds), eq(pagosUnidad.estado, "confirmado")));

  for (const id of usuarioIds) {
    const propios = eventos.filter((e) => e.inquilinoId === id);
    const deliPagos = pagos.filter((p) => p.inquilinoId === id);

    const dimensiones = dims.map((d) => {
      let puntaje = Number(d.puntajeBase);
      for (const e of propios) if (e.dimensionId === d.id) puntaje += Number(e.impacto);
      if (d.id === idPagos) {
        for (const p of deliPagos) {
          puntaje += pagoEsPuntual(p.periodo, new Date(p.fechaPago), p.diaPago, p.diasGracia)
            ? IMPACTO_PAGO_PUNTUAL : IMPACTO_PAGO_TARDIO;
        }
      }
      return { codigo: d.codigo, nombre: d.nombre, puntaje: Math.round(acota(puntaje) * 10) / 10, peso: Number(d.peso) };
    });

    const pesoTotal = dimensiones.reduce((t, d) => t + d.peso, 0) || 1;
    const puntaje = Math.round(dimensiones.reduce((t, d) => t + d.puntaje * d.peso, 0) / pesoTotal);
    const n = propios.length + deliPagos.length;
    salida.set(id, { puntaje, nivel: nivelDe(puntaje), sinHistorial: n === 0, eventos: n, dimensiones });
  }
  return salida;
}
