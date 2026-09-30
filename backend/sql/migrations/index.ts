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
// @ts-ignore
import m021 from "./021_incidencia_contacto.sql";
// @ts-ignore
import m022 from "./022_catalogo_extensible_servicios.sql";
// @ts-ignore
import m023 from "./023_contrasena_temporal.sql";
// @ts-ignore
import m024 from "./024_reservas.sql";
// @ts-ignore
import m025 from "./025_dia_pago_y_gracia.sql";
// @ts-ignore
import m026 from "./026_pagos_unidad.sql";
// @ts-ignore
import m027 from "./027_pago_unidad_estado.sql";
// @ts-ignore
import m028 from "./028_comunicado_unidades.sql";
// @ts-ignore
import m029 from "./029_facturas_propiedad.sql";
// @ts-ignore
import m030 from "./030_areas_comunes_edificacion.sql";
// @ts-ignore
import m031 from "./031_factura_edificacion.sql";
// @ts-ignore
import m032 from "./032_medidor_factura.sql";
// @ts-ignore
import m033 from "./033_anular_factura.sql";
// @ts-ignore
import m034 from "./034_referencia_pago.sql";
// @ts-ignore
import m035 from "./035_gasto_de_factura.sql";
// @ts-ignore
import m036 from "./036_tipo_gasto_insumo.sql";
// @ts-ignore
import m037 from "./037_incidencia_reportada_por.sql";
// @ts-ignore
import m038 from "./038_unidad_fechas_contrato.sql";

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
  { version: "021", nombre: "incidencia_contacto", sql: m021 as string },
  { version: "022", nombre: "catalogo_extensible_servicios", sql: m022 as string },
  { version: "023", nombre: "contrasena_temporal", sql: m023 as string },
  { version: "024", nombre: "reservas", sql: m024 as string },
  { version: "025", nombre: "dia_pago_y_gracia", sql: m025 as string },
  { version: "026", nombre: "pagos_unidad", sql: m026 as string },
  { version: "027", nombre: "pago_unidad_estado", sql: m027 as string },
  { version: "028", nombre: "comunicado_unidades", sql: m028 as string },
  { version: "029", nombre: "facturas_propiedad", sql: m029 as string },
  { version: "030", nombre: "areas_comunes_edificacion", sql: m030 as string },
  { version: "031", nombre: "factura_edificacion", sql: m031 as string },
  { version: "032", nombre: "medidor_factura", sql: m032 as string },
  { version: "033", nombre: "anular_factura", sql: m033 as string },
  { version: "034", nombre: "referencia_pago", sql: m034 as string },
  { version: "035", nombre: "gasto_de_factura", sql: m035 as string },
  { version: "036", nombre: "tipo_gasto_insumo", sql: m036 as string },
  { version: "037", nombre: "incidencia_reportada_por", sql: m037 as string },
  { version: "038", nombre: "unidad_fechas_contrato", sql: m038 as string },
];
