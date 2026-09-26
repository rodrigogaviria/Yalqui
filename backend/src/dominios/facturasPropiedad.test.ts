import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { periodoValido } from "./facturasPropiedad.js";

describe("período de consumo de una factura", () => {
  test("mensual es un mes AAAA-MM", () => {
    assert.equal(periodoValido("mensual", "2026-09"), true);
    assert.equal(periodoValido("mensual", "2026-13"), false);
    assert.equal(periodoValido("mensual", "2026-B2"), false);
    assert.equal(periodoValido("mensual", "2026"), false);
  });

  test("bimensual es un bimestre del 1 al 6", () => {
    assert.equal(periodoValido("bimensual", "2026-B1"), true);
    assert.equal(periodoValido("bimensual", "2026-B6"), true);
    assert.equal(periodoValido("bimensual", "2026-B7"), false);
    assert.equal(periodoValido("bimensual", "2026-09"), false);
  });

  test("anual es un año", () => {
    assert.equal(periodoValido("anual", "2026"), true);
    assert.equal(periodoValido("anual", "2026-09"), false);
  });
});
