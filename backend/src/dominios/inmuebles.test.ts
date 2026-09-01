import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { appRouter } from "../router.js";
import { cambiosUnidad } from "./inmuebles.js";
import { TRPCError } from "@trpc/server";

process.env.JWT_SECRET ??= "secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres";

/** Contexto sin base: sirve para ejercer guardias y validación, que fallan
 *  antes de tocar la conexión. */
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

describe("guardias de inmuebles", () => {
  test("sin sesión no se crea nada", async () => {
    const c = appRouter.createCaller(ctx(null));
    assert.equal(
      await codigoDe(() => c.inmuebles.crear({
        tipo: "apartamento", direccion: "Calle 93 #12-40", ciudad: "Bogotá",
        departamento: "Cundinamarca", canonBase: 1800000,
      })),
      "UNAUTHORIZED",
    );
  });

  test("sin sesión no se listan las propias", async () => {
    const c = appRouter.createCaller(ctx(null));
    assert.equal(await codigoDe(() => c.inmuebles.mias()), "UNAUTHORIZED");
  });

  test("propietario del 10 no puede ver el 12", async () => {
    const c = appRouter.createCaller(ctx(propietarioDe10));
    assert.equal(await codigoDe(() => c.inmuebles.ver({ inmuebleId: 12 })), "FORBIDDEN");
  });

  test("propietario del 10 no puede publicar el 12", async () => {
    const c = appRouter.createCaller(ctx(propietarioDe10));
    assert.equal(await codigoDe(() => c.inmuebles.publicar({ inmuebleId: 12 })), "FORBIDDEN");
  });

  test("el admin de Yalqui pasa el guardia de cualquier unidad", async () => {
    const admin = { id: 1, email: "a@yalqui.co",
      roles: [{ rol: "admin_yalqui", ambitoTipo: "global", ambitoId: 0 }] };
    const c = appRouter.createCaller(ctx(admin));
    // Pasa el permiso y muere en la base, que en esta prueba no existe.
    const r = await codigoDe(() => c.inmuebles.ver({ inmuebleId: 999 }));
    assert.notEqual(r, "FORBIDDEN");
  });
});

describe("validación al crear", () => {
  const c = appRouter.createCaller(ctx(propietarioDe10));
  const base = {
    tipo: "apartamento" as const, direccion: "Calle 93 #12-40", ciudad: "Bogotá",
    departamento: "Cundinamarca", canonBase: 1800000,
  };

  test("el máximo de ocupantes no puede ser menor que la base", async () => {
    assert.equal(
      await codigoDe(() => c.inmuebles.crear({ ...base, ocupantesBase: 4, ocupantesMaximo: 2 })),
      "BAD_REQUEST",
    );
  });

  test("un canon negativo no pasa la validación", async () => {
    assert.equal(await codigoDe(() => c.inmuebles.crear({ ...base, canonBase: -1 })), "BAD_REQUEST");
  });

  test("una dirección de dos letras no pasa", async () => {
    assert.equal(await codigoDe(() => c.inmuebles.crear({ ...base, direccion: "ab" })), "BAD_REQUEST");
  });

  test("un tipo de unidad inventado no pasa", async () => {
    assert.equal(
      await codigoDe(() => c.inmuebles.crear({ ...base, tipo: "mansion" as never })),
      "BAD_REQUEST",
    );
  });
});

describe("registro de cuenta", () => {
  const c = appRouter.createCaller(ctx(null));

  test("sin autorizar el tratamiento de datos no se crea la cuenta", async () => {
    assert.equal(
      await codigoDe(() => c.auth.registrar({
        email: "x@y.co", contrasena: "una clave larga", nombre: "Ana", apellido: "Ruiz",
        tipoDocumento: "CC", numeroDocumento: "1020774319",
        aceptaTratamientoDatos: false as never,
      })),
      "BAD_REQUEST",
    );
  });

  test("una contraseña corta no pasa", async () => {
    assert.equal(
      await codigoDe(() => c.auth.registrar({
        email: "x@y.co", contrasena: "corta", nombre: "Ana", apellido: "Ruiz",
        tipoDocumento: "CC", numeroDocumento: "1020774319", aceptaTratamientoDatos: true,
      })),
      "BAD_REQUEST",
    );
  });

  test("la sesión exige estar autenticado", async () => {
    assert.equal(await codigoDe(() => c.auth.sesion()), "UNAUTHORIZED");
  });
});

describe("edición parcial de una unidad", () => {
  /**
   * El riesgo que cubre: `partial()` de zod no quita los `.default()`. Si a
   * `cambiosUnidad` se le cuela un campo con default, editar solo la
   * descripción mandaría además ese campo a su valor inicial y pisaría en
   * silencio datos que nadie tocó.
   */
  test("ningún campo editable conserva su default", () => {
    const conDefault = Object.entries(cambiosUnidad.shape)
      .filter(([, campo]) => {
        // partial() envuelve en optional; el default puede quedar por dentro.
        const interno = campo instanceof z.ZodOptional ? campo.unwrap() : campo;
        return interno instanceof z.ZodDefault;
      })
      .map(([nombre]) => nombre);

    assert.deepEqual(conDefault, [], `quitales el default con removeDefault(): ${conDefault.join(", ")}`);
  });

  test("mandar un solo campo no arrastra ningún otro", () => {
    const salida = cambiosUnidad.parse({ descripcion: "Apartamento luminoso en Chapinero" });
    assert.deepEqual(Object.keys(salida), ["descripcion"]);
  });

  test("el objeto vacío no llega al UPDATE", async () => {
    const llamador = appRouter.createCaller(ctx(propietarioDe10));
    const codigo = await codigoDe(() =>
      llamador.inmuebles.editar({ inmuebleId: 10, cambios: {} }),
    );
    assert.equal(codigo, "BAD_REQUEST");
  });

  test("no se edita una unidad ajena", async () => {
    const llamador = appRouter.createCaller(ctx(propietarioDe10));
    const codigo = await codigoDe(() =>
      llamador.inmuebles.editar({ inmuebleId: 99, cambios: { descripcion: "ajena" } }),
    );
    assert.equal(codigo, "FORBIDDEN");
  });
});
