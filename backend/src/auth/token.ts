import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * El secreto se inyecta desde Secrets Manager en el despliegue. Si falta, la
 * Lambda debe morir al arrancar y no emitir tokens con una clave inventada:
 * un token firmado con un secreto vacío lo puede falsificar cualquiera.
 */
function secreto(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET ausente o demasiado corto: se exigen 32 caracteres o más");
  }
  return new TextEncoder().encode(s);
}

const EMISOR = "yalqui";
const AUDIENCIA = "yalqui-app";

export interface Sesion {
  usuarioId: number;
  email: string;
}

export async function emitirToken(sesion: Sesion): Promise<{ token: string; expiraEn: number }> {
  const duracion = process.env.JWT_EXPIRES_IN ?? "7d";
  const token = await new SignJWT({ email: sesion.email } satisfies JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(sesion.usuarioId))
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt()
    .setExpirationTime(duracion)
    .sign(secreto());

  return { token, expiraEn: Math.floor(Date.now() / 1000) + duracionEnSegundos(duracion) };
}

/** Devuelve la sesión, o null si el token falta, venció o no verifica. */
export async function leerToken(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), {
      issuer: EMISOR,
      audience: AUDIENCIA,
      algorithms: ["HS256"], // fijo: evita que un token diga alg:none y pase
    });
    const usuarioId = Number(payload.sub);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) return null;
    return { usuarioId, email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}

function duracionEnSegundos(d: string): number {
  const m = /^(\d+)([smhd])$/.exec(d);
  if (!m) return 7 * 86_400;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86_400 }[m[2] as "s" | "m" | "h" | "d"]);
}
