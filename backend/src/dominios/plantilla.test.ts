import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { enLetras, fechaLarga, enPesos, renderizar } from "./plantilla.js";

describe("el monto en letras", () => {
  test("los montos que aparecen en un arriendo", () => {
    assert.equal(enLetras(1_300_000), "un millón trescientos mil pesos");
    assert.equal(enLetras(600_000), "seiscientos mil pesos");
    assert.equal(enLetras(2_800_000), "dos millones ochocientos mil pesos");
    assert.equal(enLetras(1_000_000), "un millón de pesos");
    assert.equal(enLetras(21_000), "veintiún mil pesos");
  });

  test("los casos que rompen las reglas del castellano", () => {
    assert.equal(enLetras(100), "cien pesos");
    assert.equal(enLetras(115), "ciento quince pesos");
    assert.equal(enLetras(16), "dieciséis pesos");
    assert.equal(enLetras(31), "treinta y un pesos");
    assert.equal(enLetras(0), "cero pesos");
    assert.equal(enLetras(21), "veintiún pesos");
    assert.equal(enLetras(2_000_000), "dos millones de pesos");
  });

  test("los centavos no se escriben: un arriendo no los lleva", () => {
    assert.equal(enLetras(1_300_000.75), "un millón trescientos mil pesos");
  });
});

describe("formato de contrato", () => {
  test("la fecha se escribe como en un documento", () => {
    assert.equal(fechaLarga("2026-07-21"), "21 de julio de 2026");
  });

  test("una fecha en texto no se corre de día por la zona horaria", () => {
    // Sin la hora fijada al mediodía, «2026-01-01» se interpreta como UTC y en
    // Colombia cae el 31 de diciembre.
    assert.equal(fechaLarga("2026-01-01"), "1 de enero de 2026");
  });

  test("el monto lleva separador de miles", () => {
    assert.equal(enPesos(1_300_000), "$1.300.000");
  });
});

describe("renderizado de la plantilla", () => {
  test("reemplaza lo que tiene", () => {
    const { texto } = renderizar("Entre {{arrendador}} y {{arrendatario}}.", {
      arrendador: "Rodrigo Gaviria",
      arrendatario: "Estefanía Duque",
    });
    assert.equal(texto, "Entre Rodrigo Gaviria y Estefanía Duque.");
  });

  test("un dato que falta queda visible, no se borra", () => {
    // Un contrato que dice «{{matricula}}» avisa que falta un dato; uno que
    // dice «matrícula número .» parece completo y no lo está.
    const { texto, faltantes } = renderizar("Matrícula {{matricula}}.", {});
    assert.equal(texto, "Matrícula {{matricula}}.");
    assert.deepEqual(faltantes, ["matricula"]);
  });

  test("el mismo marcador varias veces se reemplaza en todas", () => {
    const { texto } = renderizar("{{meses}} meses, prórroga de {{meses}} meses.", { meses: "12" });
    assert.equal(texto, "12 meses, prórroga de 12 meses.");
  });

  test("una cadena vacía cuenta como faltante", () => {
    const { faltantes } = renderizar("{{celular_arrendatario}}", { celular_arrendatario: "" });
    assert.deepEqual(faltantes, ["celular_arrendatario"]);
  });
});
