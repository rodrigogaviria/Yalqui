import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nivelDe, pagoEsPuntual } from "./score.js";

describe("score", () => {
  test("los niveles cortan donde dice el modelo", () => {
    assert.equal(nivelDe(90), "excelente");
    assert.equal(nivelDe(85), "excelente");
    assert.equal(nivelDe(70), "bueno");
    assert.equal(nivelDe(69.9 | 0), "regular");
    assert.equal(nivelDe(55), "regular");
    assert.equal(nivelDe(40), "riesgo");
    assert.equal(nivelDe(39), "critico");
  });

  test("un pago es puntual hasta el día previsto más la gracia", () => {
    // Día 5 con 3 de gracia: el límite es el 8.
    assert.equal(pagoEsPuntual("2026-09", new Date("2026-09-08T12:00:00Z"), 5, 3), true);
    assert.equal(pagoEsPuntual("2026-09", new Date("2026-09-09T12:00:00Z"), 5, 3), false);
    assert.equal(pagoEsPuntual("2026-09", new Date("2026-09-01T12:00:00Z"), 5, 3), true);
  });

  test("el día 31 en un mes corto vence el último del mes, más la gracia", () => {
    // Septiembre tiene 30: día 31 → 30, más 2 de gracia → 2 de octubre.
    assert.equal(pagoEsPuntual("2026-09", new Date("2026-10-02T12:00:00Z"), 31, 2), true);
    assert.equal(pagoEsPuntual("2026-09", new Date("2026-10-03T12:00:00Z"), 31, 2), false);
  });
});
