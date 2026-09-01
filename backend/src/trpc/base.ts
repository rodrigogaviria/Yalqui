import { initTRPC, TRPCError } from "@trpc/server";
import type { Contexto } from "../context.js";
import { esAdmin, tieneRol, type Ambito, type Rol } from "../auth/roles.js";

const t = initTRPC.context<Contexto>().create();

export const router = t.router;

/** No exige sesión. Buscar inmuebles publicados, por ejemplo. */
export const publico = t.procedure;

/** Exige sesión válida. Deja `ctx.usuario` no nulo para lo que venga después. */
export const privado = t.procedure.use(({ ctx, next }) => {
  if (ctx.usuario === null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Iniciá sesión para continuar" });
  }
  return next({ ctx: { ...ctx, usuario: ctx.usuario } });
});

/** Solo administración de Yalqui. */
export const admin = privado.use(({ ctx, next }) => {
  if (!esAdmin(ctx.usuario.roles)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Requiere administración de Yalqui" });
  }
  return next({ ctx });
});

/**
 * Exige un rol sobre un ámbito concreto, sacado de la propia entrada.
 *
 * El ámbito no se toma de un parámetro suelto sino de lo que el procedimiento
 * ya recibe, para que no exista la forma de pedir «propietario» sin decir de
 * qué. Es la matriz de permisos aplicada en un solo lugar en vez de repartida
 * en `if` por todo el código.
 */
export function exigirRol<E>(
  rol: Rol,
  ambitoTipo: Ambito,
  sacarId: (entrada: E) => number,
) {
  return privado.use(async ({ ctx, next, getRawInput }) => {
    const entrada = (await getRawInput()) as E;
    const ambitoId = sacarId(entrada);

    if (!Number.isInteger(ambitoId) || ambitoId <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Falta identificar sobre qué actuar" });
    }
    if (!tieneRol(ctx.usuario.roles, rol, ambitoTipo, ambitoId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenés permiso sobre esto" });
    }
    return next({ ctx });
  });
}
