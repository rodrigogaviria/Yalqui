import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "../db/index.js";
import type { RolOtorgado } from "./roles.js";
import { esAdmin } from "./roles.js";
import { contratos } from "../db/schema/contrato.js";
import { inmuebles } from "../db/schema/inventario.js";

/**
 * Quién puede tocar los pagos de un contrato: el inquilino que lo firmó, el
 * propietario de la unidad, el administrador de su edificación y el admin de
 * Yalqui. Los cuatro llegan por caminos distintos —rol sobre el contrato, la
 * unidad o la edificación—, así que se resuelve acá y no con un rol fijo.
 */
export async function accesoAlContrato(
  db: Database,
  usuario: { id: number; roles: RolOtorgado[] },
  contratoId: number,
) {
  const [c] = await db
    .select({
      id: contratos.id,
      inmuebleId: contratos.inmuebleId,
      inquilinoId: contratos.inquilinoId,
      edificacionId: inmuebles.edificacionId,
    })
    .from(contratos)
    .innerJoin(inmuebles, eq(inmuebles.id, contratos.inmuebleId))
    .where(eq(contratos.id, contratoId))
    .limit(1);

  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Ese contrato no existe" });

  const rol =
    c.inquilinoId === usuario.id ? "inquilino"
    : usuario.roles.some((r) => r.rol === "propietario" && r.ambitoTipo === "inmueble" && r.ambitoId === c.inmuebleId) ? "propietario"
    : c.edificacionId !== null && usuario.roles.some(
        (r) => r.rol === "administrador_inmueble" && r.ambitoTipo === "edificacion" && r.ambitoId === c.edificacionId,
      ) ? "administrador"
    : esAdmin(usuario.roles) ? "admin"
    : null;

  if (rol === null) throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre ese contrato" });
  return { contrato: c, rol };
}
