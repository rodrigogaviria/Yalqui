import {
  mysqlTable, int, varchar, char, boolean, tinyint, smallint, decimal,
  mysqlEnum, uniqueIndex, index,
} from "drizzle-orm/mysql-core";
// El marco legal es el mismo que rige los contratos: una sola definición, para
// que un tipo de inmueble no pueda apuntar a un marco que el contrato ignora.
import { MARCOS_LEGALES } from "./contrato.js";

/**
 * Las tablas que configuran el sistema. Se editan desde la administración y no
 * con una migración: agregar una ciudad o cambiar la tasa de IVA no debería
 * necesitar un despliegue.
 */

export const paises = mysqlTable("paises", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigoIso2: char("codigo_iso2", { length: 2 }).notNull(),
  codigoIso3: char("codigo_iso3", { length: 3 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  prefijoTelefono: varchar("prefijo_telefono", { length: 6 }),
  moneda: char("moneda", { length: 3 }).notNull().default("COP"),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [
  uniqueIndex("uk_paises_iso2").on(t.codigoIso2),
  uniqueIndex("uk_paises_iso3").on(t.codigoIso3),
]);

export const departamentos = mysqlTable("departamentos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  paisId: int("pais_id", { unsigned: true }).notNull(),
  /** DANE de dos dígitos: la llave con la que se cruza cualquier dato oficial. */
  codigoDane: char("codigo_dane", { length: 2 }),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [
  uniqueIndex("uk_depto_pais_nombre").on(t.paisId, t.nombre),
  index("ix_depto_dane").on(t.codigoDane),
]);

export const ciudades = mysqlTable("ciudades", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  departamentoId: int("departamento_id", { unsigned: true }).notNull(),
  /** DANE de municipio: cinco dígitos, los dos primeros son el departamento. */
  codigoDane: char("codigo_dane", { length: 5 }),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  esCapital: boolean("es_capital").notNull().default(false),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [
  uniqueIndex("uk_ciudad_depto_nombre").on(t.departamentoId, t.nombre),
  index("ix_ciudad_dane").on(t.codigoDane),
  index("ix_ciudad_nombre").on(t.nombre),
]);

export const barrios = mysqlTable("barrios", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  ciudadId: int("ciudad_id", { unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  /** Localidad en Bogotá, comuna en Medellín. Texto porque cada ciudad nombra
   *  ese nivel distinto y no hay jerarquía nacional que valga imponer. */
  localidad: varchar("localidad", { length: 120 }),
  estrato: tinyint("estrato", { unsigned: true }),
  activo: boolean("activo").notNull().default(true),
}, (t) => [
  uniqueIndex("uk_barrio_ciudad_nombre").on(t.ciudadId, t.nombre),
  index("ix_barrio_nombre").on(t.nombre),
]);

/**
 * Lo configurable de cada tipo de inmueble.
 *
 * `inmuebles.tipo` sigue siendo un ENUM y esa es la restricción de integridad.
 * Acá se decide cómo se llama el tipo, si se ofrece y qué campos pide el
 * formulario. Inventar un tipo nuevo sigue necesitando migración: el marco
 * legal de algo que nadie modeló no lo resuelve un formulario.
 */
export const tiposInmueble = mysqlTable("tipos_inmueble", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  plural: varchar("plural", { length: 120 }).notNull(),
  marcoLegal: mysqlEnum("marco_legal", MARCOS_LEGALES).notNull(),
  esResidencial: boolean("es_residencial").notNull().default(true),
  pideHabitaciones: boolean("pide_habitaciones").notNull().default(true),
  pideBanos: boolean("pide_banos").notNull().default(true),
  pideArea: boolean("pide_area").notNull().default(true),
  admiteMascotas: boolean("admite_mascotas").notNull().default(true),
  icono: varchar("icono", { length: 40 }),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_tipoinm_codigo").on(t.codigo)]);

export const TIPOS_PARAMETRO = ["texto", "entero", "decimal", "booleano", "json"] as const;

export const parametros = mysqlTable("parametros", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  clave: varchar("clave", { length: 80 }).notNull(),
  valor: varchar("valor", { length: 500 }).notNull(),
  tipo: mysqlEnum("tipo", TIPOS_PARAMETRO).notNull().default("texto"),
  categoria: varchar("categoria", { length: 60 }).notNull().default("general"),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  descripcion: varchar("descripcion", { length: 500 }),
  unidad: varchar("unidad", { length: 20 }),
  /** Un parámetro de sistema se lee pero no se edita: cambiarlo rompería
   *  supuestos del código, no solo una política comercial. */
  editable: boolean("editable").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [
  uniqueIndex("uk_parametros_clave").on(t.clave),
  index("ix_parametros_categoria").on(t.categoria),
]);

export const TIPOS_MOVIMIENTO = ["ingreso", "egreso"] as const;
export const AMBITOS_GASTO = ["unidad", "edificacion", "ambos"] as const;
export const RESPONSABLES = ["propietario", "inquilino", "compartido", "copropiedad", "por_definir"] as const;
export const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const;
export const AMBITOS_INCIDENCIA = ["unidad", "area_comun", "ambos"] as const;
export const APLICA_REQUISITO = ["inquilino", "codeudor", "propietario", "proveedor"] as const;
export const MODOS_REQUISITO = ["cualquiera", "todos"] as const;

/**
 * Cómo se clasifica cada peso que entra y sale de un inmueble.
 *
 * Una sola tabla con discriminador y no dos: ingreso y egreso tienen la misma
 * forma y se consultan juntos en el estado de resultados de un inmueble.
 */
export const tiposMovimiento = mysqlTable("tipos_movimiento", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  tipo: mysqlEnum("tipo", TIPOS_MOVIMIENTO).notNull(),
  descripcion: varchar("descripcion", { length: 255 }),
  /** Un egreso deducible baja la renta del propietario. */
  deducible: boolean("deducible").notNull().default(false),
  /** Si el gasto es de la edificación se prorratea entre las unidades. Es la
   *  diferencia entre pintar la fachada y arreglar un grifo. */
  ambito: mysqlEnum("ambito", AMBITOS_GASTO).notNull().default("ambos"),
  responsable: mysqlEnum("responsable", RESPONSABLES).notNull().default("por_definir"),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_tipomov_codigo").on(t.codigo)]);

/**
 * Los tipos de incidencia.
 *
 * El tipo es además el vocabulario de especialidades de los proveedores: uno
 * atiende los tipos que sabe resolver, y así no hay dos listas que se puedan
 * desincronizar.
 */
export const tiposIncidencia = mysqlTable("tipos_incidencia", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  descripcion: varchar("descripcion", { length: 255 }),
  ambito: mysqlEnum("ambito", AMBITOS_INCIDENCIA).notNull().default("ambos"),
  prioridadSugerida: mysqlEnum("prioridad_sugerida", PRIORIDADES).notNull().default("media"),
  /** Horas para atender. Calcula el vencimiento del SLA sin que nadie lo
   *  escriba a mano en cada incidencia. */
  slaHoras: smallint("sla_horas", { unsigned: true }),
  responsableSugerido: mysqlEnum("responsable_sugerido", RESPONSABLES).notNull().default("por_definir"),
  tipoMovimientoId: int("tipo_movimiento_id", { unsigned: true }),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_tipoinc_codigo").on(t.codigo)]);

export const tiposDocumento = mysqlTable("tipos_documento", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  descripcion: varchar("descripcion", { length: 255 }),
  /** Un certificado laboral de hace ocho meses no dice nada del presente.
   *  NULL es un documento que no caduca, como la cédula. */
  vigenciaDias: smallint("vigencia_dias", { unsigned: true }),
  formatos: varchar("formatos", { length: 120 }).notNull().default("pdf,jpg,png"),
  tamanoMaxMb: tinyint("tamano_max_mb", { unsigned: true }).notNull().default(10),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_tipodoc_codigo").on(t.codigo)]);

/**
 * Un requisito es lo que hay que demostrar; un tipo de documento es con qué se
 * demuestra. Casi nunca hay un solo camino: «demostrar ingresos» lo resuelve un
 * certificado laboral, o tres extractos, o una declaración de renta, según de
 * qué viva la persona. Pedir siempre los tres es lo que vuelve trámite arrendar.
 */
export const requisitos = mysqlTable("requisitos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  descripcion: varchar("descripcion", { length: 500 }),
  aplicaA: mysqlEnum("aplica_a", APLICA_REQUISITO).notNull(),
  /** `cualquiera`: con uno de los documentos alcanza. `todos`: hacen falta todos. */
  modo: mysqlEnum("modo", MODOS_REQUISITO).notNull().default("cualquiera"),
  obligatorio: boolean("obligatorio").notNull().default(true),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_requisito_codigo").on(t.codigo)]);

export const requisitoDocumentos = mysqlTable("requisito_documentos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  requisitoId: int("requisito_id", { unsigned: true }).notNull(),
  tipoDocumentoId: int("tipo_documento_id", { unsigned: true }).notNull(),
  nota: varchar("nota", { length: 255 }),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_reqdoc").on(t.requisitoId, t.tipoDocumentoId)]);

/**
 * Qué le exige este propietario a quien quiera arrendar esta unidad.
 *
 * Es una tabla de excepciones, no una copia del catálogo: sin fila vale lo que
 * diga `requisitos.obligatorio`. Así, un requisito nuevo que Yalqui agregue
 * aplica solo a todas las unidades, sin recorrerlas una por una.
 */
export const inmuebleRequisitos = mysqlTable("inmueble_requisitos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  requisitoId: int("requisito_id", { unsigned: true }).notNull(),
  exigido: boolean("exigido").notNull(),
  nota: varchar("nota", { length: 255 }),
}, (t) => [uniqueIndex("uk_inmreq").on(t.inmuebleId, t.requisitoId)]);
