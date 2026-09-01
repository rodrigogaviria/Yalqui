// Registro ordenado de migraciones. Cada .sql se embebe como texto en el
// paquete (loader configurado en el CDK), así que la Lambda no lee del disco.
// Para agregar una: crear el archivo y sumarla acá, al final y nunca en medio.
// @ts-ignore
import m001 from "./001_identidad_inventario.sql";
// @ts-ignore
import m002 from "./002_demanda.sql";
// @ts-ignore
import m003 from "./003_contrato.sql";
// @ts-ignore
import m004 from "./004_dinero.sql";
// @ts-ignore
import m005 from "./005_planes_y_catalogos.sql";

// @ts-ignore
import m006 from "./006_operacion.sql";
// @ts-ignore
import m007 from "./007_verificacion_score.sql";
// @ts-ignore
import m008 from "./008_negocio_yalqui.sql";
// @ts-ignore
import m009 from "./009_comunicacion_publicacion.sql";
// @ts-ignore
import m010 from "./010_fase3.sql";
// @ts-ignore
import m011 from "./011_semillas_fase2.sql";
// @ts-ignore
import m012 from "./012_administracion.sql";
// @ts-ignore
import m013 from "./013_catalogos_operativos.sql";
// @ts-ignore
import m014 from "./014_yalqui_seguro.sql";
// @ts-ignore
import m015 from "./015_configuracion_propietario.sql";
// @ts-ignore
import m016 from "./016_incidencias_al_catalogo.sql";
// @ts-ignore
import m017 from "./017_plantillas_contrato.sql";
// @ts-ignore
import m018 from "./018_activacion_cuenta.sql";
// @ts-ignore
import m019 from "./019_texto_contrato.sql";
// @ts-ignore
import m020 from "./020_plantilla_real.sql";

export interface Migracion {
  readonly version: string;
  readonly nombre: string;
  readonly sql: string;
}

export const MIGRACIONES: readonly Migracion[] = [
  { version: "001", nombre: "identidad_inventario", sql: m001 as string },
  { version: "002", nombre: "demanda", sql: m002 as string },
  { version: "003", nombre: "contrato", sql: m003 as string },
  { version: "004", nombre: "dinero", sql: m004 as string },
  { version: "005", nombre: "planes_y_catalogos", sql: m005 as string },
  { version: "006", nombre: "operacion", sql: m006 as string },
  { version: "007", nombre: "verificacion_score", sql: m007 as string },
  { version: "008", nombre: "negocio_yalqui", sql: m008 as string },
  { version: "009", nombre: "comunicacion_publicacion", sql: m009 as string },
  { version: "010", nombre: "fase3", sql: m010 as string },
  { version: "011", nombre: "semillas_fase2", sql: m011 as string },
  { version: "012", nombre: "administracion", sql: m012 as string },
  { version: "013", nombre: "catalogos_operativos", sql: m013 as string },
  { version: "014", nombre: "yalqui_seguro", sql: m014 as string },
  { version: "015", nombre: "configuracion_propietario", sql: m015 as string },
  { version: "016", nombre: "incidencias_al_catalogo", sql: m016 as string },
  { version: "017", nombre: "plantillas_contrato", sql: m017 as string },
  { version: "018", nombre: "activacion_cuenta", sql: m018 as string },
  { version: "019", nombre: "texto_contrato", sql: m019 as string },
  { version: "020", nombre: "plantilla_real", sql: m020 as string },
];
