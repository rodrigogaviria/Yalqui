import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  clave: string | Buffer,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt de la librería estándar, no bcrypt ni argon2.
 *
 * Los dos últimos son módulos nativos y esta API corre en Lambda con esbuild:
 * un binario compilado obliga a empaquetar por arquitectura y rompe el
 * despliegue desde una máquina distinta a la de destino. scrypt viene en Node,
 * es memory-hard y no agrega dependencias al bundle.
 */
const N = 2 ** 15; // ~32 MB por hash; sube el costo de una fuerza bruta masiva
const r = 8;
const p = 1;
const LARGO_SAL = 16;
const LARGO_CLAVE = 32;
const MAXMEM = 64 * 1024 * 1024;

/** Devuelve `scrypt$N$r$p$sal$hash`, todo en una columna. */
export async function cifrarContrasena(plana: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const hash = await scrypt(plana.normalize("NFKC"), sal, LARGO_CLAVE, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${sal.toString("base64url")}$${hash.toString("base64url")}`;
}

/**
 * Comparación en tiempo constante. Nunca lanza por un formato raro: un hash
 * corrupto en la base es un login fallido, no un 500 que revela que el usuario
 * existe.
 */
export async function verificarContrasena(plana: string, guardado: string): Promise<boolean> {
  try {
    const [algo, sN, sr, sp, sSal, sHash] = guardado.split("$");
    if (algo !== "scrypt") return false;

    const esperado = Buffer.from(sHash!, "base64url");
    const calculado = await scrypt(plana.normalize("NFKC"), Buffer.from(sSal!, "base64url"),
      esperado.length, { N: Number(sN), r: Number(sr), p: Number(sp), maxmem: MAXMEM });

    return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}
