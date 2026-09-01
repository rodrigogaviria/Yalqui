import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../router.js";

process.env.JWT_SECRET ??= "secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres";

function ctx(usuario: unknown = null) {
  return { db: null as never, usuario, ip: "1.2.3.4", userAgent: "prueba" } as never;
}

const propietarioDe10 = {
  id: 7,
  email: "duenio@ejemplo.co",
  roles: [{ rol: "propietario", ambitoTipo: "inmueble", ambitoId: 10 }],
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "SIN_ERROR";
  } catch (e) {
    return e instanceof TRPCError ? e.code : `OTRO:${(e as Error).message}`;
  }
}

describe("configuración de la unidad", () => {
  test("sin sesión no se configura nada", async () => {
    const llamador = appRouter.createCaller(ctx());
    assert.equal(
      await codigoDe(() => llamador.configuracion.canon({ inmuebleId: 10 })),
      "UNAUTHORIZED",
    );
  });

  test("no se configura el precio de una unidad ajena", async () => {
    const llamador = appRouter.createCaller(ctx(propietarioDe10));
    assert.equal(
      await codigoDe(() => llamador.configuracion.configurarAjuste({
        inmuebleId: 99, ajusteId: 1, disponible: true, valor: 100000, obligatorio: false,
      })),
      "FORBIDDEN",
    );
  });

  test("no se leen los requisitos de una unidad ajena", async () => {
    const llamador = appRouter.createCaller(ctx(propietarioDe10));
    assert.equal(
      await codigoDe(() => llamador.configuracion.requisitos({ inmuebleId: 99 })),
      "FORBIDDEN",
    );
  });

  test("un porcentaje fuera de rango no llega a la base", async () => {
    const llamador = appRouter.createCaller(ctx(propietarioDe10));
    assert.equal(
      await codigoDe(() => llamador.configuracion.configurarAjuste({
        inmuebleId: 10, ajusteId: 1, disponible: true, porcentaje: 150, obligatorio: false,
      })),
      "BAD_REQUEST",
    );
  });

  test("un valor negativo no llega a la base", async () => {
    const llamador = appRouter.createCaller(ctx(propietarioDe10));
    assert.equal(
      await codigoDe(() => llamador.configuracion.configurarAjuste({
        inmuebleId: 10, ajusteId: 1, disponible: true, valor: -5000, obligatorio: false,
      })),
      "BAD_REQUEST",
    );
  });
});
