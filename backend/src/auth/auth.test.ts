import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cifrarContrasena, verificarContrasena } from "./password.js";
import { emitirToken, leerToken } from "./token.js";
import { tieneRol, esAdmin, ambitosCon, type RolOtorgado } from "./roles.js";

process.env.JWT_SECRET ??= "secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres";

describe("contraseñas", () => {
  test("una contraseña verifica contra su propio hash", async () => {
    const h = await cifrarContrasena("una clave larga y decente");
    assert.equal(await verificarContrasena("una clave larga y decente", h), true);
  });

  test("una contraseña equivocada no verifica", async () => {
    const h = await cifrarContrasena("una clave larga y decente");
    assert.equal(await verificarContrasena("una clave larga y decenta", h), false);
  });

  test("el mismo texto da hashes distintos: la sal es aleatoria", async () => {
    const [a, b] = await Promise.all([cifrarContrasena("igual"), cifrarContrasena("igual")]);
    assert.notEqual(a, b);
  });

  test("un hash corrupto es un login fallido, no una excepción", async () => {
    for (const basura of ["", "no-es-un-hash", "scrypt$x$y$z", "bcrypt$1$2$3$4$5"]) {
      assert.equal(await verificarContrasena("lo que sea", basura), false);
    }
  });

  test("la normalización unicode no cambia el resultado", async () => {
    const h = await cifrarContrasena("contraseña café");           // NFC
    assert.equal(await verificarContrasena("contraseña café", h), true); // NFD
  });
});

describe("tokens", () => {
  test("un token emitido se lee de vuelta", async () => {
    const { token } = await emitirToken({ usuarioId: 42, email: "a@b.co" });
    const s = await leerToken(token);
    assert.deepEqual(s, { usuarioId: 42, email: "a@b.co" });
  });

  test("un token alterado no verifica", async () => {
    const { token } = await emitirToken({ usuarioId: 42, email: "a@b.co" });
    const partes = token.split(".");
    const alterado = `${partes[0]}.${Buffer.from('{"sub":"1"}').toString("base64url")}.${partes[2]}`;
    assert.equal(await leerToken(alterado), null);
  });

  test("un token firmado con otro secreto no verifica", async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "otro-secreto-igual-de-largo-para-la-prueba-xx";
    const { token } = await emitirToken({ usuarioId: 7, email: "x@y.co" });
    process.env.JWT_SECRET = original;
    assert.equal(await leerToken(token), null);
  });

  test("sin token no hay sesión", async () => {
    assert.equal(await leerToken(undefined), null);
    assert.equal(await leerToken(""), null);
    assert.equal(await leerToken("basura"), null);
  });

  test("alg:none no pasa", async () => {
    const cab = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url");
    const cuerpo = Buffer.from('{"sub":"1","iss":"yalqui","aud":"yalqui-app"}').toString("base64url");
    assert.equal(await leerToken(`${cab}.${cuerpo}.`), null);
  });
});

describe("roles con ámbito", () => {
  const roles: RolOtorgado[] = [
    { rol: "propietario", ambitoTipo: "inmueble", ambitoId: 10 },
    { rol: "propietario", ambitoTipo: "inmueble", ambitoId: 11 },
    { rol: "inquilino", ambitoTipo: "contrato", ambitoId: 99 },
  ];

  test("propietario de lo suyo, no de lo ajeno", () => {
    assert.equal(tieneRol(roles, "propietario", "inmueble", 10), true);
    assert.equal(tieneRol(roles, "propietario", "inmueble", 12), false);
  });

  test("el rol no se transfiere entre ámbitos", () => {
    assert.equal(tieneRol(roles, "propietario", "contrato", 10), false);
    assert.equal(tieneRol(roles, "inquilino", "inmueble", 99), false);
  });

  test("el admin de Yalqui pasa sobre cualquier cosa", () => {
    const a: RolOtorgado[] = [{ rol: "admin_yalqui", ambitoTipo: "global", ambitoId: 0 }];
    assert.equal(esAdmin(a), true);
    assert.equal(tieneRol(a, "propietario", "inmueble", 12345), true);
  });

  test("un admin sin ámbito global no es admin", () => {
    const falso: RolOtorgado[] = [{ rol: "admin_yalqui", ambitoTipo: "inmueble", ambitoId: 1 }];
    assert.equal(esAdmin(falso), false);
  });

  test("listar lo mío devuelve solo mis ámbitos", () => {
    assert.deepEqual(ambitosCon(roles, "propietario", "inmueble"), [10, 11]);
    assert.deepEqual(ambitosCon(roles, "personal_propiedad", "edificacion"), []);
  });
});
