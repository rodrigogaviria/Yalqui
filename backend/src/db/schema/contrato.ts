import {
  mysqlTable, int, bigint, varchar, char, json, boolean, tinyint, smallint,
  timestamp, date, decimal, mysqlEnum, uniqueIndex, index, mediumtext,
} from "drizzle-orm/mysql-core";

/** El marco legal no es una etiqueta: vivienda y comercial son leyes distintas. */
export const MARCOS_LEGALES = ["vivienda_urbana", "comercial", "habitacion", "parqueadero", "mixto"] as const;

export const plantillasContrato = mysqlTable("plantillas_contrato", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 191 }).notNull(),
  marcoLegal: mysqlEnum("marco_legal", MARCOS_LEGALES).notNull(),
  aplicaATipos: json("aplica_a_tipos"),
  cuerpo: mediumtext("cuerpo").notNull(),
  variables: json("variables"),
  version: smallint("version", { unsigned: true }).notNull().default(1),
  estado: mysqlEnum("estado", ["borrador", "vigente", "archivada"]).notNull().default("borrador"),
  creadaPorId: int("creada_por_id", { unsigned: true }),
  vigenteDesde: date("vigente_desde"),
  vigenteHasta: date("vigente_hasta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uk_plantilla_codigo_version").on(t.codigo, t.version),
  index("ix_plantilla_marco").on(t.marcoLegal, t.estado),
]);

/** `canonMensual` es solo la BASE: lo que paga el inquilino son base + ajustes. */
export const contratos = mysqlTable("contratos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  uuid: char("uuid", { length: 36 }).notNull(),
  numero: varchar("numero", { length: 30 }).notNull(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  propietarioId: int("propietario_id", { unsigned: true }).notNull(),
  inquilinoId: int("inquilino_id", { unsigned: true }).notNull(),
  aplicacionId: int("aplicacion_id", { unsigned: true }),
  contratoAnteriorId: int("contrato_anterior_id", { unsigned: true }),
  plantillaId: int("plantilla_id", { unsigned: true }).notNull(),
  plantillaVersion: smallint("plantilla_version", { unsigned: true }).notNull(),
  clausulasOpcionales: json("clausulas_opcionales"),
  estado: mysqlEnum("estado",
    ["borrador", "pendiente_firma", "vigente", "en_mora", "en_terminacion", "terminado"])
    .notNull().default("borrador"),
  fechaInicio: date("fecha_inicio").notNull(),
  fechaFin: date("fecha_fin").notNull(),
  mesesPlazo: smallint("meses_plazo", { unsigned: true }).notNull(),
  canonMensual: decimal("canon_mensual", { precision: 14, scale: 2 }).notNull(),
  valorAdministracion: decimal("valor_administracion", { precision: 14, scale: 2 }).notNull().default("0.00"),
  administracionIncluida: boolean("administracion_incluida").notNull().default(false),
  diaPago: tinyint("dia_pago", { unsigned: true }).notNull(),
  garantiaTipo: mysqlEnum("garantia_tipo", ["codeudor", "poliza", "fiador", "deposito", "ninguna"])
    .notNull().default("ninguna"),
  deposito: decimal("deposito", { precision: 14, scale: 2 }),
  regimenIva: mysqlEnum("regimen_iva", ["excluido", "gravado"]).notNull().default("excluido"),
  tarifaIva: decimal("tarifa_iva", { precision: 5, scale: 2 }).notNull().default("0.00"),
  inquilinoAgenteRetenedor: boolean("inquilino_agente_retenedor").notNull().default(false),
  tarifaRetencion: decimal("tarifa_retencion", { precision: 5, scale: 2 }).notNull().default("0.00"),
  incrementoTipo: mysqlEnum("incremento_tipo", ["ipc", "ipc_mas_puntos", "fijo", "ninguno"])
    .notNull().default("ipc"),
  incrementoValor: decimal("incremento_valor", { precision: 5, scale: 2 }),
  prorrogaAutomatica: boolean("prorroga_automatica").notNull().default(true),
  archivoId: bigint("archivo_id", { mode: "number", unsigned: true }),
  hashDocumento: char("hash_documento", { length: 64 }),
  firmadoAt: timestamp("firmado_at"),
  terminadoAt: timestamp("terminado_at"),
  motivoTerminacion: varchar("motivo_terminacion", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [
  uniqueIndex("uk_contratos_uuid").on(t.uuid),
  uniqueIndex("uk_contratos_numero").on(t.numero),
  index("ix_contratos_vencimiento").on(t.estado, t.fechaFin),
  index("ix_contratos_inmueble").on(t.inmuebleId),
  index("ix_contratos_inquilino").on(t.inquilinoId),
]);

/** Precio congelado al firmar; vigencias para entrar o salir a mitad de contrato. */
export const contratoAjustes = mysqlTable("contrato_ajustes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  contratoId: int("contrato_id", { unsigned: true }).notNull(),
  ajusteId: int("ajuste_id", { unsigned: true }).notNull(),
  cantidad: smallint("cantidad", { unsigned: true }).notNull().default(1),
  valorUnitario: decimal("valor_unitario", { precision: 14, scale: 2 }).notNull(),
  valorTotal: decimal("valor_total", { precision: 14, scale: 2 }).notNull(),
  periodicidad: mysqlEnum("periodicidad", ["mensual", "unico"]).notNull().default("mensual"),
  vigenteDesde: date("vigente_desde").notNull(),
  vigenteHasta: date("vigente_hasta"),
  nota: varchar("nota", { length: 255 }),
}, (t) => [
  index("ix_contajuste_contrato").on(t.contratoId, t.vigenteDesde),
  index("ix_contajuste_ajuste").on(t.ajusteId),
]);

/** Un enlace único por firmante, de un solo uso. Nadie firma por otro. */
export const contratoFirmas = mysqlTable("contrato_firmas", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  contratoId: int("contrato_id", { unsigned: true }).notNull(),
  rolFirma: mysqlEnum("rol_firma",
    ["propietario", "socio_propietario", "inquilino", "garante", "testigo"]).notNull(),
  usuarioId: int("usuario_id", { unsigned: true }),
  nombre: varchar("nombre", { length: 191 }).notNull(),
  numeroDocumento: varchar("numero_documento", { length: 40 }),
  telefono: varchar("telefono", { length: 30 }),
  orden: tinyint("orden", { unsigned: true }).notNull().default(0),
  tokenFirma: char("token_firma", { length: 64 }),
  tokenExpiraAt: timestamp("token_expira_at"),
  enviadoAt: timestamp("enviado_at"),
  vistoAt: timestamp("visto_at"),
  otpEnviadoAt: timestamp("otp_enviado_at"),
  otpVerificado: boolean("otp_verificado").notNull().default(false),
  estado: mysqlEnum("estado",
    ["pendiente", "enviado", "visto", "firmado", "rechazado", "expirado"])
    .notNull().default("pendiente"),
  firmadoAt: timestamp("firmado_at"),
  ip: varchar("ip", { length: 45 }),
  userAgent: varchar("user_agent", { length: 255 }),
  proveedorFirma: varchar("proveedor_firma", { length: 60 }),
  evidencia: json("evidencia"),
}, (t) => [
  uniqueIndex("uk_firma_token").on(t.tokenFirma),
  index("ix_firmas_contrato").on(t.contratoId, t.estado),
]);
