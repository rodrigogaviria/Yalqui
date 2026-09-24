import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { aplicaciones } from "../db/schema/demanda.js";
import { contratos } from "../db/schema/contrato.js";

/**
 * Las unidades de las que esta persona es arrendataria.
 *
 * Sale de dos lados y no del rol `inquilino`: ese rol nace al firmar el
 * contrato, pero un propietario puede haber registrado a su inquilino antes
 * (una aplicación aprobada) y esa persona ya necesita ver su unidad, pagar y
 * reportar daños.
 */
export async function unidadesDelInquilino(db: Database, usuarioId: number): Promise<number[]> {
  const designadas = await db
    .select({ inmuebleId: aplicaciones.inmuebleId })
    .from(aplicaciones)
    .where(and(eq(aplicaciones.inquilinoId, usuarioId), eq(aplicaciones.estado, "aprobada")));

  const conContrato = await db
    .select({ inmuebleId: contratos.inmuebleId })
    .from(contratos)
    .where(and(
      eq(contratos.inquilinoId, usuarioId),
      inArray(contratos.estado, ["borrador", "pendiente_firma", "vigente", "en_mora", "en_terminacion"]),
    ));

  return [...new Set([...designadas, ...conContrato].map((x) => x.inmuebleId))];
}

export async function esArrendatarioDe(db: Database, usuarioId: number, inmuebleId: number): Promise<boolean> {
  return (await unidadesDelInquilino(db, usuarioId)).includes(inmuebleId);
}
