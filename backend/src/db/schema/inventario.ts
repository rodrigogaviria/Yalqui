import {
  mysqlTable, int, bigint, varchar, char, text, json, boolean, tinyint, smallint,
  timestamp, date, decimal, mysqlEnum, uniqueIndex, index,
} from "drizzle-orm/mysql-core";

/** El edificio como hecho verificable, no como etiqueta.
 *  `regimen` define de quién son las zonas comunes y quién manda. */
export const edificaciones = mysqlTable("edificaciones", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  nombre: varchar("nombre", { length: 191 }).notNull(),
  tipo: mysqlEnum("tipo", ["edificio", "conjunto", "casa_dividida", "zona"]).notNull(),
  regimen: mysqlEnum("regimen", ["copropiedad", "propiedad_unica", "informal"]).notNull(),
  propietarioId: int("propietario_id", { unsigned: true }),
  direccion: varchar("direccion", { length: 255 }).notNull(),
  barrio: varchar("barrio", { length: 120 }),
  ciudad: varchar("ciudad", { length: 120 }).notNull(),
  latitud: decimal("latitud", { precision: 10, scale: 7 }),
  longitud: decimal("longitud", { precision: 10, scale: 7 }),
  numUnidades: smallint("num_unidades", { unsigned: true }),
  areaComunM2: decimal("area_comun_m2", { precision: 10, scale: 2 }),
  administracionNombre: varchar("administracion_nombre", { length: 191 }),
  administracionTelefono: varchar("administracion_telefono", { length: 30 }),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_edif_ciudad").on(t.ciudad, t.activo)]);

export const TIPOS_UNIDAD = [
  "apartamento", "casa", "local", "oficina", "habitacion", "parqueadero", "bodega", "lote",
] as const;

export const ESTADOS_UNIDAD = [
  "borrador", "publicado", "pausado", "reservado", "arrendado", "archivado",
] as const;

/** La unidad arrendable y facturable.
 *  `propietarioId` es el principal; los socios viven en inmueblePropietarios.
 *  `edificacionId` es nulo a propósito: la unidad suelta es de primera clase. */
export const inmuebles = mysqlTable("inmuebles", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  uuid: char("uuid", { length: 36 }).notNull(),
  codigoPublico: varchar("codigo_publico", { length: 20 }).notNull(),
  propietarioId: int("propietario_id", { unsigned: true }).notNull(),
  edificacionId: int("edificacion_id", { unsigned: true }),
  tipo: mysqlEnum("tipo", TIPOS_UNIDAD).notNull(),
  estado: mysqlEnum("estado", ESTADOS_UNIDAD).notNull().default("borrador"),
  direccion: varchar("direccion", { length: 255 }).notNull(),
  complemento: varchar("complemento", { length: 120 }),
  barrio: varchar("barrio", { length: 120 }),
  ciudad: varchar("ciudad", { length: 120 }).notNull(),
  departamento: varchar("departamento", { length: 120 }).notNull(),
  latitud: decimal("latitud", { precision: 10, scale: 7 }),
  longitud: decimal("longitud", { precision: 10, scale: 7 }),
  estrato: tinyint("estrato", { unsigned: true }),
  areaConstruidaM2: decimal("area_construida_m2", { precision: 10, scale: 2 }),
  areaPrivadaM2: decimal("area_privada_m2", { precision: 10, scale: 2 }),
  habitaciones: tinyint("habitaciones", { unsigned: true }),
  banos: tinyint("banos", { unsigned: true }),
  parqueaderos: tinyint("parqueaderos", { unsigned: true }),
  ocupantesBase: tinyint("ocupantes_base", { unsigned: true }).notNull().default(1),
  ocupantesMaximo: tinyint("ocupantes_maximo", { unsigned: true }),
  mascotasMaximo: tinyint("mascotas_maximo", { unsigned: true }).notNull().default(0),
  mascotasTiposAdmitidos: json("mascotas_tipos_admitidos"),
  piso: tinyint("piso", { unsigned: true }),
  anioConstruccion: smallint("anio_construccion", { unsigned: true }),
  amoblado: boolean("amoblado").notNull().default(false),
  administracionIncluida: boolean("administracion_incluida").notNull().default(false),
  valorAdministracion: decimal("valor_administracion", { precision: 14, scale: 2 }).notNull().default("0.00"),
  canonBase: decimal("canon_base", { precision: 14, scale: 2 }).notNull(),
  deposito: decimal("deposito", { precision: 14, scale: 2 }),
  topeIngresoPct: decimal("tope_ingreso_pct", { precision: 5, scale: 2 }).notNull().default("50.00"),
  serviciosPublicosIncluidos: mysqlEnum("servicios_publicos_incluidos",
    ["ninguno", "algunos", "todos"]).notNull().default("ninguno"),
  matriculaInmobiliaria: varchar("matricula_inmobiliaria", { length: 60 }),
  chipCatastral: varchar("chip_catastral", { length: 60 }),
  descripcion: text("descripcion"),
  publicadoAt: timestamp("publicado_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [
  uniqueIndex("uk_inmuebles_uuid").on(t.uuid),
  uniqueIndex("uk_inmuebles_codigo").on(t.codigoPublico),
  index("ix_inmuebles_propietario").on(t.propietarioId),
  index("ix_inmuebles_ciudad_estado").on(t.ciudad, t.estado),
  index("ix_inmuebles_busqueda").on(t.estado, t.tipo, t.canonBase),
  index("ix_inmuebles_edificacion").on(t.edificacionId),
]);

/** `apareceEnTitulo` decide a quién le exige firma el contrato. */
export const inmueblePropietarios = mysqlTable("inmueble_propietarios", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  usuarioId: int("usuario_id", { unsigned: true }).notNull(),
  rol: mysqlEnum("rol", ["principal", "socio"]).notNull(),
  porcentaje: decimal("porcentaje", { precision: 5, scale: 2 }).notNull(),
  apareceEnTitulo: boolean("aparece_en_titulo").notNull().default(true),
  puedeDecidir: boolean("puede_decidir").notNull().default(false),
  puedeVerFinanzas: boolean("puede_ver_finanzas").notNull().default(true),
  desde: date("desde").notNull(),
  hasta: date("hasta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_inmprop_usuario").on(t.usuarioId)]);

export const etiquetas = mysqlTable("etiquetas", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  ambitoTipo: mysqlEnum("ambito_tipo", ["propietario", "edificacion"]).notNull(),
  ambitoId: int("ambito_id", { unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 60 }).notNull(),
  color: char("color", { length: 7 }),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
  activo: boolean("activo").notNull().default(true),
  creadaPorId: int("creada_por_id", { unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uk_etiquetas_ambito_nombre").on(t.ambitoTipo, t.ambitoId, t.nombre),
  index("ix_etiquetas_orden").on(t.ambitoTipo, t.ambitoId, t.orden),
]);

/** `esPrincipal` define en qué grupo cae al agrupar. Sin eso los totales mienten. */
export const inmuebleEtiquetas = mysqlTable("inmueble_etiquetas", {
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  etiquetaId: int("etiqueta_id", { unsigned: true }).notNull(),
  esPrincipal: boolean("es_principal").notNull().default(false),
  asignadaAt: timestamp("asignada_at").notNull().defaultNow(),
  asignadaPorId: int("asignada_por_id", { unsigned: true }),
}, (t) => [index("ix_inmetq_etiqueta").on(t.etiquetaId)]);

export const inmuebleFotos = mysqlTable("inmueble_fotos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  archivoId: bigint("archivo_id", { mode: "number", unsigned: true }).notNull(),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
  esPortada: boolean("es_portada").notNull().default(false),
  descripcion: varchar("descripcion", { length: 255 }),
  ancho: smallint("ancho", { unsigned: true }),
  alto: smallint("alto", { unsigned: true }),
  bytes: int("bytes", { unsigned: true }),
  hashPercep: char("hash_percep", { length: 16 }),
  estadoRevision: mysqlEnum("estado_revision",
    ["pendiente", "apta", "con_observaciones", "rechazada"]).notNull().default("pendiente"),
  observaciones: json("observaciones"),
  revisadaAt: timestamp("revisada_at"),
}, (t) => [
  index("ix_fotos_inmueble_orden").on(t.inmuebleId, t.orden),
  index("ix_fotos_revision").on(t.inmuebleId, t.estadoRevision),
]);

/** Catálogo de Yalqui, para que los avisos sean comparables entre sí. */
export const catalogoAjustes = mysqlTable("catalogo_ajustes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  descripcion: varchar("descripcion", { length: 255 }),
  categoria: mysqlEnum("categoria",
    ["comodidad", "ocupacion", "mascota", "parqueadero", "servicio", "otro"]).notNull(),
  tipoCalculo: mysqlEnum("tipo_calculo", ["monto_fijo", "porcentaje", "por_cantidad"]).notNull(),
  periodicidad: mysqlEnum("periodicidad", ["mensual", "unico"]).notNull().default("mensual"),
  permiteCantidad: boolean("permite_cantidad").notNull().default(false),
  /** Punto de partida editable para que el formulario no arranque en cero.
   *  El precio real de cada unidad vive en `inmueble_ajustes`. */
  valorSugerido: decimal("valor_sugerido", { precision: 14, scale: 2 }),
  porcentajeSugerido: decimal("porcentaje_sugerido", { precision: 6, scale: 3 }),
  aplicaATipos: json("aplica_a_tipos"),
  icono: varchar("icono", { length: 40 }),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_catajustes_codigo").on(t.codigo)]);

/** Lo que esta unidad ofrece y a cuánto. El canon nunca es un número plano. */
export const inmuebleAjustes = mysqlTable("inmueble_ajustes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  ajusteId: int("ajuste_id", { unsigned: true }).notNull(),
  disponible: boolean("disponible").notNull().default(true),
  valor: decimal("valor", { precision: 14, scale: 2 }).notNull().default("0.00"),
  porcentaje: decimal("porcentaje", { precision: 6, scale: 3 }),
  cantidadMaxima: tinyint("cantidad_maxima", { unsigned: true }),
  obligatorio: boolean("obligatorio").notNull().default(false),
  nota: varchar("nota", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [uniqueIndex("uk_inmajuste").on(t.inmuebleId, t.ajusteId)]);
