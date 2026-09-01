import { and, eq, isNull, or } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { usuarioRoles, type ROLES, type AMBITOS } from "../db/schema/identidad.js";

export type Rol = (typeof ROLES)[number];
export type Ambito = (typeof AMBITOS)[number];

export interface RolOtorgado {
  rol: Rol;
  ambitoTipo: Ambito;
  ambitoId: number;
}

/**
 * Los roles vigentes de un usuario. Se leen del servidor en cada solicitud y
 * nunca del token: si a alguien se le revoca un rol, tiene que perder el acceso
 * de inmediato y no cuando venza su sesión de siete días.
 */
export async function rolesDe(db: Database, usuarioId: number): Promise<RolOtorgado[]> {
  const filas = await db
    .select({
      rol: usuarioRoles.rol,
      ambitoTipo: usuarioRoles.ambitoTipo,
      ambitoId: usuarioRoles.ambitoId,
    })
    .from(usuarioRoles)
    .where(and(eq(usuarioRoles.usuarioId, usuarioId), isNull(usuarioRoles.revocadoAt)));

  return filas as RolOtorgado[];
}

/** ¿Es admin de Yalqui? Único rol con ámbito global. */
export function esAdmin(roles: RolOtorgado[]): boolean {
  return roles.some((r) => r.rol === "admin_yalqui" && r.ambitoTipo === "global");
}

/**
 * ¿Tiene este rol sobre esta cosa concreta?
 *
 * El admin de Yalqui pasa siempre — es el único con alcance global. Para todos
 * los demás la pregunta «¿es propietario?» no significa nada sin el «¿de qué?»,
 * y por eso el ámbito es obligatorio.
 */
export function tieneRol(
  roles: RolOtorgado[],
  rol: Rol,
  ambitoTipo: Ambito,
  ambitoId: number,
): boolean {
  if (esAdmin(roles)) return true;
  return roles.some(
    (r) => r.rol === rol && r.ambitoTipo === ambitoTipo && r.ambitoId === ambitoId,
  );
}

/** Los ids sobre los que el usuario tiene un rol dado. Para listar «lo mío». */
export function ambitosCon(roles: RolOtorgado[], rol: Rol, ambitoTipo: Ambito): number[] {
  return roles
    .filter((r) => r.rol === rol && r.ambitoTipo === ambitoTipo)
    .map((r) => r.ambitoId);
}

/**
 * Otorga un rol. Idempotente: volver a otorgar el mismo rol sobre el mismo
 * ámbito no duplica la fila, la reactiva. Revocar sella la fecha en vez de
 * borrar, porque hay que poder responder quién podía qué el día que se firmó
 * un contrato.
 */
export async function otorgarRol(
  db: Database,
  usuarioId: number,
  rol: Rol,
  ambitoTipo: Ambito,
  ambitoId: number,
  otorgadoPorId?: number,
): Promise<void> {
  await db
    .insert(usuarioRoles)
    .values({ usuarioId, rol, ambitoTipo, ambitoId, otorgadoPorId: otorgadoPorId ?? null })
    .onDuplicateKeyUpdate({ set: { revocadoAt: null, otorgadoAt: new Date() } });
}
