import type { CreateAWSLambdaContextOptions } from "@trpc/server/adapters/aws-lambda";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { db, type Database } from "./db/index.js";
import { leerToken } from "./auth/token.js";
import { rolesDe, type RolOtorgado } from "./auth/roles.js";

export interface UsuarioSesion {
  id: number;
  email: string;
  roles: RolOtorgado[];
}

/**
 * Contexto de cada solicitud.
 *
 * La identidad sale del token firmado; los roles se leen de la base en cada
 * solicitud y nunca del token, para que revocar un permiso surta efecto ya y
 * no cuando venza la sesión. La autorización se resuelve siempre acá.
 */
export interface Contexto {
  db: Database;
  usuario: UsuarioSesion | null;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export async function crearContexto(
  opts: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>,
): Promise<Contexto> {
  const req = opts.event.requestContext;
  const base = {
    db,
    ip: req?.http?.sourceIp,
    userAgent: opts.event.headers?.["user-agent"],
  };

  const sesion = await leerToken(bearer(opts.event.headers?.authorization));
  if (sesion === null) return { ...base, usuario: null };

  // Un token válido de un usuario que ya no está activo no vale: la sesión se
  // corta al suspender la cuenta, no al vencer el token.
  const roles = await rolesDe(db, sesion.usuarioId);
  return {
    ...base,
    usuario: { id: sesion.usuarioId, email: sesion.email, roles },
  };
}

function bearer(cabecera: string | undefined): string | undefined {
  if (!cabecera) return undefined;
  const [tipo, valor] = cabecera.split(" ");
  return tipo?.toLowerCase() === "bearer" ? valor : undefined;
}
