import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { repartir } from "./gastoDeFactura.js";

const suma = (xs: number[]) => Math.round(xs.reduce((t, x) => t + x, 0) * 100) / 100;

describe("reparto del gasto entre unidades", () => {
  test("partes iguales que no dividen exacto: la suma es exactamente el total", () => {
    const r = repartir(100, [1, 1, 1]);
    assert.equal(suma(r), 100);
    assert.deepEqual([...r].sort(), [33.33, 33.33, 33.34]);
  });

  test("por área o por canon: proporcional a los pesos", () => {
    assert.deepEqual(repartir(300000, [20, 40, 40]), [60000, 120000, 120000]);
  });

  test("los centavos que sobran van a la unidad de más peso", () => {
    const r = repartir(1000, [1, 2]);
    assert.equal(suma(r), 1000);
    assert.equal(r[1], 666.67);
  });

  test("veinticuatro unidades: nunca se pierde ni se inventa un centavo", () => {
    for (const total of [1, 99.99, 123456.78, 5_000_000]) {
      const r = repartir(total, Array.from({ length: 24 }, () => 1));
      assert.equal(suma(r), total, `total ${total}`);
      assert.ok(r.every((x) => x >= 0));
    }
  });

  test("sin pesos no hay reparto", () => {
    assert.deepEqual(repartir(100, []), []);
    assert.deepEqual(repartir(100, [0, 0]), []);
  });
});
