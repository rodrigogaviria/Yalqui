import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "backend";

/**
 * El cliente se tipa contra el router del backend, tomando el tipo que este
 * emite en `dist`. No hay contrato duplicado ni generación de código: si allá
 * cambia un procedimiento, acá deja de compilar.
 *
 * Se importa el tipo compilado y no el código fuente para que el frontend no
 * tenga que compilar el backend con sus propias reglas — que no incluyen los
 * tipos de Node y fallarían en cualquier `import "node:crypto"`.
 */
const URL_API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const CLAVE_TOKEN = "yalqui.token";

export const sesion = {
  token: () => localStorage.getItem(CLAVE_TOKEN),
  guardar: (t: string) => localStorage.setItem(CLAVE_TOKEN, t),
  borrar: () => localStorage.removeItem(CLAVE_TOKEN),
};

export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${URL_API}/trpc`,
      headers: () => {
        const t = sesion.token();
        return t ? { authorization: `Bearer ${t}` } : {};
      },
    }),
  ],
});

/** Traduce el error del servidor a algo que se le pueda mostrar a una persona. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof TRPCClientError) {
    // Zod devuelve el detalle campo por campo; mostramos el primero, que es
    // el que la persona tiene que corregir ahora.
    const zod = e.data?.zodError?.fieldErrors as Record<string, string[]> | undefined;
    if (zod) {
      const primero = Object.values(zod).flat()[0];
      if (primero) return primero;
    }
    if (e.data?.code === "UNAUTHORIZED") return e.message || "Iniciá sesión para continuar";
    return e.message;
  }
  if (e instanceof Error && e.message.includes("fetch")) {
    return "No pudimos conectar con el servidor. ¿Está corriendo el backend?";
  }
  return "Algo salió mal. Intentá de nuevo.";
}
