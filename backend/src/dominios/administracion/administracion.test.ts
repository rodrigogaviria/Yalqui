import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../../router.js";

process.env.JWT_SECRET ??= "secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres";

/** Contexto sin base: los guardias y la validación fallan antes de consultar. */
function ctx(usuario: unknown = null) {
  return { db: null as never, usuario, ip: "1.2.3.4", userAgent: "prueba" } as never;
}

const propietario = {
  id: 7,
  email: "duenio@ejemplo.co",
  roles: [{ rol: "propietario", ambitoTipo: "inmueble", ambitoId: 10 }],
};

const admin = {
  id: 1,
  email: "yalqui@yalqui.com.co",
  roles: [{ rol: "admin_yalqui", ambitoTipo: "global", ambitoId: 0 }],
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "SIN_ERROR";
  } catch (e) {
    return e instanceof TRPCError ? e.code : `OTRO:${(e as Error).message}`;
  }
}

describe("quién entra a la administración", () => {
  test("sin sesión no se lee la configuración", async () => {
    const llamador = appRouter.createCaller(ctx());
    assert.equal(await codigoDe(() => llamador.admin.catalogos.parametros()), "UNAUTHORIZED");
  });

  test("ser propietario no alcanza para administrar el sistema", async () => {
    const llamador = appRouter.createCaller(ctx(propietario));
    assert.equal(await codigoDe(() => llamador.admin.catalogos.tipos()), "FORBIDDEN");
    assert.equal(await codigoDe(() => llamador.admin.usuarios.listar({ pagina: 1 })), "FORBIDDEN");
    assert.equal(
      await codigoDe(() => llamador.admin.geografia.crearCiudad({ departamentoId: 1, nombre: "Nueva" })),
      "FORBIDDEN",
    );
  });

  test("un propietario sí puede leer geografía", async () => {
    // La lectura es pública a propósito: el formulario de alta de una unidad la
    // necesita antes de que exista rol alguno. Llega hasta la base, y sin base
    // el error ya no es de permisos.
    const llamador = appRouter.createCaller(ctx(propietario));
    const codigo = await codigoDe(() => llamador.admin.geografia.paises());
    assert.notEqual(codigo, "FORBIDDEN");
    assert.notEqual(codigo, "UNAUTHORIZED");
  });
});

describe("reglas de los roles", () => {
  test("solo la administración de Yalqui puede ser global", async () => {
    const llamador = appRouter.createCaller(ctx(admin));
    assert.equal(
      await codigoDe(() => llamador.admin.usuarios.otorgarRol({
        usuarioId: 5, rol: "propietario", ambitoTipo: "global", ambitoId: 0,
      })),
      "BAD_REQUEST",
    );
  });

  test("la administración de Yalqui no puede ser de un inmueble", async () => {
    const llamador = appRouter.createCaller(ctx(admin));
    assert.equal(
      await codigoDe(() => llamador.admin.usuarios.otorgarRol({
        usuarioId: 5, rol: "admin_yalqui", ambitoTipo: "inmueble", ambitoId: 3,
      })),
      "BAD_REQUEST",
    );
  });

  test("un rol con ámbito exige decir sobre qué", async () => {
    const llamador = appRouter.createCaller(ctx(admin));
    assert.equal(
      await codigoDe(() => llamador.admin.usuarios.otorgarRol({
        usuarioId: 5, rol: "inquilino", ambitoTipo: "contrato", ambitoId: 0,
      })),
      "BAD_REQUEST",
    );
  });

  test("nadie se suspende a sí mismo", async () => {
    const llamador = appRouter.createCaller(ctx(admin));
    assert.equal(
      await codigoDe(() => llamador.admin.usuarios.cambiarEstado({
        usuarioId: admin.id, estado: "suspendido",
      })),
      "BAD_REQUEST",
    );
  });
});
