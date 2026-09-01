import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Enlaces de un solo uso para gente sin sesión: precalificación, confirmación
 * del aportante, firma del contrato.
 *
 * El token viaja por WhatsApp y por eso es la única credencial de quien lo
 * abre. Se busca por su hash y no por el valor: quien lea la base no puede
 * usarlos, igual que con una contraseña.
 */
export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación en tiempo constante, para no filtrar el token carácter a carácter. */
export function tokenCoincide(recibido: string, guardado: string): boolean {
  const a = Buffer.from(hashToken(recibido), "hex");
  const b = Buffer.from(guardado, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vencimiento en horas desde ahora. */
export function expiraEn(horas: number): Date {
  return new Date(Date.now() + horas * 3_600_000);
}
