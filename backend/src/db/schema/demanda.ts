import {
  mysqlTable, int, bigint, varchar, char, text, json, boolean, tinyint, smallint,
  timestamp, date, decimal, mysqlEnum, uniqueIndex, index,
} from "drizzle-orm/mysql-core";

export const DOCUMENTOS = ["CC", "CE", "NIT", "PA"] as const;
export const OCUPACIONES = ["estudiante", "empleado", "independiente", "pensionado"] as const;

export const visitas = mysqlTable("visitas", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  interesadoId: int("interesado_id", { unsigned: true }),
  nombreContacto: varchar("nombre_contacto", { length: 191 }),
  telefonoContacto: varchar("telefono_contacto", { length: 30 }),
  emailContacto: varchar("email_contacto", { length: 191 }),
  inicioAt: timestamp("inicio_at").notNull(),
  finAt: timestamp("fin_at"),
  modalidad: mysqlEnum("modalidad", ["presencial", "virtual"]).notNull().default("presencial"),
  estado: mysqlEnum("estado",
    ["solicitada", "confirmada", "reprogramada", "realizada", "cancelada", "no_asistio"])
    .notNull().default("solicitada"),
  reprogramadaDeId: int("reprogramada_de_id", { unsigned: true }),
  notas: text("notas"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_visitas_inmueble").on(t.inmuebleId, t.inicioAt),
  index("ix_visitas_estado").on(t.estado, t.inicioAt),
]);

/** El criterio de preaprobación como datos y con versiones. */
export const reglasPrecalificacion = mysqlTable("reglas_precalificacion", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  version: smallint("version", { unsigned: true }).notNull().default(1),
  condiciones: json("condiciones"),
  umbralHolgado: decimal("umbral_holgado", { precision: 5, scale: 2 }).notNull().default("35.00"),
  umbralAjustado: decimal("umbral_ajustado", { precision: 5, scale: 2 }).notNull().default("45.00"),
  umbralLimite: decimal("umbral_limite", { precision: 5, scale: 2 }).notNull().default("50.00"),
  exigeAportanteDesde: decimal("exige_aportante_desde", { precision: 5, scale: 2 }).notNull().default("50.00"),
  estado: mysqlEnum("estado", ["borrador", "vigente", "archivada"]).notNull().default("borrador"),
  vigenteDesde: date("vigente_desde"),
  vigenteHasta: date("vigente_hasta"),
  creadaPorId: int("creada_por_id", { unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uk_reglas_codigo_version").on(t.codigo, t.version),
  index("ix_reglas_estado").on(t.estado),
]);

/**
 * Preaprobado NO es aprobado: corre sobre ingresos declarados.
 * Los campos demográficos se piden para identidad y ficha y NO entran al cálculo.
 */
export const precalificaciones = mysqlTable("precalificaciones", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  visitaId: int("visita_id", { unsigned: true }),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  interesadoId: int("interesado_id", { unsigned: true }),
  token: char("token", { length: 64 }),
  tokenExpiraAt: timestamp("token_expira_at").notNull(),
  nombreCompleto: varchar("nombre_completo", { length: 191 }),
  tipoDocumento: mysqlEnum("tipo_documento", DOCUMENTOS),
  numeroDocumento: varchar("numero_documento", { length: 40 }),
  fechaNacimiento: date("fecha_nacimiento"),
  ciudadNacimiento: varchar("ciudad_nacimiento", { length: 120 }),
  genero: mysqlEnum("genero", ["femenino", "masculino", "no_binario", "otro", "prefiere_no_decir"]),
  ocupacion: mysqlEnum("ocupacion", OCUPACIONES),
  ingresosDeclarados: decimal("ingresos_declarados", { precision: 14, scale: 2 }),
  ingresosAportantes: decimal("ingresos_aportantes", { precision: 14, scale: 2 }).notNull().default("0.00"),
  ingresosTotales: decimal("ingresos_totales", { precision: 14, scale: 2 }),
  ingresoVerificado: decimal("ingreso_verificado", { precision: 14, scale: 2 }),
  metodoIngreso: mysqlEnum("metodo_ingreso", ["declarado", "extractos", "nomina"])
    .notNull().default("declarado"),
  antiguedadLaboralMeses: smallint("antiguedad_laboral_meses", { unsigned: true }),
  variabilidadIngreso: decimal("variabilidad_ingreso", { precision: 5, scale: 2 }),
  cuotaCreditos: decimal("cuota_creditos", { precision: 14, scale: 2 }),
  canonEvaluado: decimal("canon_evaluado", { precision: 14, scale: 2 }).notNull(),
  gastosUnidad: decimal("gastos_unidad", { precision: 14, scale: 2 }).notNull().default("0.00"),
  disponibleEstimado: decimal("disponible_estimado", { precision: 14, scale: 2 }),
  numDependientes: tinyint("num_dependientes", { unsigned: true }),
  canonAnterior: decimal("canon_anterior", { precision: 14, scale: 2 }),
  motivoMudanza: varchar("motivo_mudanza", { length: 255 }),
  relacionPct: decimal("relacion_pct", { precision: 5, scale: 2 }),
  reglaId: int("regla_id", { unsigned: true }),
  nivel: mysqlEnum("nivel", ["holgado", "ajustado", "al_limite", "no_alcanza"]),
  razones: json("razones"),
  requiereRevision: boolean("requiere_revision").notNull().default(false),
  estado: mysqlEnum("estado",
    ["enviada", "en_diligenciamiento", "preaprobada", "con_reservas", "no_alcanza", "expirada"])
    .notNull().default("enviada"),
  enviadaAt: timestamp("enviada_at").notNull().defaultNow(),
  completadaAt: timestamp("completada_at"),
}, (t) => [
  uniqueIndex("uk_precal_token").on(t.token),
  index("ix_precal_inmueble").on(t.inmuebleId, t.estado),
  index("ix_precal_visita").on(t.visitaId),
]);

/** El aportante confirma por su propio enlace, no por boca del aplicante. */
export const precalificacionAportantes = mysqlTable("precalificacion_aportantes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  precalificacionId: int("precalificacion_id", { unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 191 }).notNull(),
  relacion: mysqlEnum("relacion",
    ["madre", "padre", "pareja", "hermano", "familiar", "empleador", "amigo", "otro"]).notNull(),
  tipoDocumento: mysqlEnum("tipo_documento", DOCUMENTOS),
  numeroDocumento: varchar("numero_documento", { length: 40 }),
  telefono: varchar("telefono", { length: 30 }).notNull(),
  ocupacion: mysqlEnum("ocupacion", OCUPACIONES),
  ingresosDeclarados: decimal("ingresos_declarados", { precision: 14, scale: 2 }),
  token: char("token", { length: 64 }),
  tokenExpiraAt: timestamp("token_expira_at").notNull(),
  estado: mysqlEnum("estado", ["pendiente", "confirmado", "rechazado", "expirado"])
    .notNull().default("pendiente"),
  aceptaSerCodeudor: boolean("acepta_ser_codeudor").notNull().default(false),
  consentimientoId: int("consentimiento_id", { unsigned: true }),
  enviadoAt: timestamp("enviado_at"),
  confirmadoAt: timestamp("confirmado_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uk_aportante_token").on(t.token),
  index("ix_aportante_precal").on(t.precalificacionId),
]);

export const aplicaciones = mysqlTable("aplicaciones", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  inquilinoId: int("inquilino_id", { unsigned: true }).notNull(),
  precalificacionId: int("precalificacion_id", { unsigned: true }),
  estado: mysqlEnum("estado", ["borrador", "enviada", "en_verificacion", "en_negociacion",
    "aprobada", "rechazada", "retirada", "convertida"]).notNull().default("borrador"),
  canonOfrecido: decimal("canon_ofrecido", { precision: 14, scale: 2 }),
  fechaIngresoDeseada: date("fecha_ingreso_deseada"),
  numOcupantes: tinyint("num_ocupantes", { unsigned: true }),
  numMascotas: tinyint("num_mascotas", { unsigned: true }).notNull().default(0),
  mensaje: text("mensaje"),
  enviadaAt: timestamp("enviada_at"),
  decididaAt: timestamp("decidida_at"),
  decididaPorId: int("decidida_por_id", { unsigned: true }),
  motivoRechazo: varchar("motivo_rechazo", { length: 500 }),
  contratoId: int("contrato_id", { unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [
  index("ix_aplic_inmueble").on(t.inmuebleId, t.estado),
  index("ix_aplic_inquilino").on(t.inquilinoId, t.estado),
]);

/** Lo que el aplicante eligió: hace comparables dos ofertas del mismo monto. */
export const aplicacionAjustes = mysqlTable("aplicacion_ajustes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  aplicacionId: int("aplicacion_id", { unsigned: true }).notNull(),
  ajusteId: int("ajuste_id", { unsigned: true }).notNull(),
  cantidad: smallint("cantidad", { unsigned: true }).notNull().default(1),
  valorUnitario: decimal("valor_unitario", { precision: 14, scale: 2 }).notNull(),
  valorTotal: decimal("valor_total", { precision: 14, scale: 2 }).notNull(),
}, (t) => [uniqueIndex("uk_aplajuste").on(t.aplicacionId, t.ajusteId)]);

/** Revisión humana, no verificación externa. */
export const aplicacionDocumentos = mysqlTable("aplicacion_documentos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  aplicacionId: int("aplicacion_id", { unsigned: true }).notNull(),
  tipo: mysqlEnum("tipo", ["documento_identidad", "certificado_laboral", "extractos_bancarios",
    "declaracion_renta", "referencia", "rut", "otro"]).notNull(),
  archivoId: bigint("archivo_id", { mode: "number", unsigned: true }),
  obligatorio: boolean("obligatorio").notNull().default(false),
  estadoRevision: mysqlEnum("estado_revision", ["pendiente", "aceptado", "rechazado"])
    .notNull().default("pendiente"),
  revisadoPorId: int("revisado_por_id", { unsigned: true }),
  revisadoAt: timestamp("revisado_at"),
  nota: varchar("nota", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_aplidoc_revision").on(t.aplicacionId, t.estadoRevision)]);
