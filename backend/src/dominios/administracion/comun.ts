import { TRPCError } from "@trpc/server";

/**
 * Deja solo las claves que el cliente mandó.
 *
 * En una edición parcial un campo ausente significa «no lo toques». Si se
 * pasara el objeto entero al UPDATE, cada `undefined` iría a borrar un dato
 * que nadie pidió cambiar. Y un UPDATE sin columnas es SQL inválido, así que
 * el objeto vacío se rechaza en vez de llegar a la base.
 */
export function cambiosDe(campos: Record<string, unknown>): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor !== undefined) set[clave] = valor;
  }
  if (Object.keys(set).length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No hay nada que cambiar" });
  }
  return set;
}

/** El código de un catálogo: minúsculas, sin espacios ni tildes. Es la llave
 *  con la que el código lo referencia, no lo que la persona lee. */
export const codigoCatalogo = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * Convierte una violación de clave única en un error legible.
 *
 * Un `INSERT` con un código repetido llega desde MySQL como
 * `ER_DUP_ENTRY` — un mensaje en inglés con el nombre del índice adentro, que
 * no debería viajar tal cual hasta la pantalla. El resto de errores se
 * relanza sin tocar: esto no es un manejador general, es la traducción de un
 * caso puntual.
 */
export function comoConflicto(e: unknown, mensaje: string): never {
  // Drizzle envuelve el error real de mysql2 en el suyo propio — el mensaje
  // pasa a ser «Failed query: ...» y el código de MySQL queda un nivel más
  // abajo, en `cause`.
  const err = e as { code?: string; cause?: { code?: string } } | null;
  const codigo = err?.code ?? err?.cause?.code;
  if (codigo === "ER_DUP_ENTRY") {
    throw new TRPCError({ code: "CONFLICT", message: mensaje });
  }
  throw e;
}
