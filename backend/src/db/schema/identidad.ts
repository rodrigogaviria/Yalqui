import {
  mysqlTable, int, bigint, varchar, char, text, json, boolean, tinyint, smallint,
  timestamp, date, decimal, mysqlEnum, uniqueIndex, index,
} from "drizzle-orm/mysql-core";

export const usuarios = mysqlTable("usuarios", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  email: varchar("email", { length: 191 }).notNull(),
  passwordHash: varchar("password_hash", { length: 191 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  apellido: varchar("apellido", { length: 120 }).notNull(),
  telefono: varchar("telefono", { length: 30 }),
  tipoDocumento: mysqlEnum("tipo_documento", ["CC", "CE", "NIT", "PA"]).notNull(),
  numeroDocumento: varchar("numero_documento", { length: 40 }).notNull(),
  estado: mysqlEnum("estado", ["pendiente", "activo", "suspendido"]).notNull().default("pendiente"),
  emailVerificadoAt: timestamp("email_verificado_at"),
  telefonoVerificadoAt: timestamp("telefono_verificado_at"),
  ultimoAccesoAt: timestamp("ultimo_acceso_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [
  uniqueIndex("uk_usuarios_email").on(t.email),
  uniqueIndex("uk_usuarios_documento").on(t.tipoDocumento, t.numeroDocumento),
]);

/** Los siete roles del modelo. El ámbito responde «propietario ¿de qué?». */
export const ROLES = [
  "admin_yalqui", "administrador_inmueble", "propietario",
  "socio_propietario", "inquilino", "personal_propiedad", "proveedor",
] as const;

export const AMBITOS = ["global", "inmueble", "edificacion", "contrato"] as const;

export const usuarioRoles = mysqlTable("usuario_roles", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  usuarioId: int("usuario_id", { unsigned: true }).notNull(),
  rol: mysqlEnum("rol", ROLES).notNull(),
  ambitoTipo: mysqlEnum("ambito_tipo", AMBITOS).notNull(),
  ambitoId: int("ambito_id", { unsigned: true }).notNull().default(0),
  otorgadoAt: timestamp("otorgado_at").notNull().defaultNow(),
  otorgadoPorId: int("otorgado_por_id", { unsigned: true }),
  revocadoAt: timestamp("revocado_at"),
}, (t) => [
  uniqueIndex("uk_usuario_rol_ambito").on(t.usuarioId, t.rol, t.ambitoTipo, t.ambitoId),
  index("ix_roles_ambito").on(t.ambitoTipo, t.ambitoId),
]);

export const perfilesPropietario = mysqlTable("perfiles_propietario", {
  usuarioId: int("usuario_id", { unsigned: true }).primaryKey(),
  tipoPersona: mysqlEnum("tipo_persona", ["natural", "juridica"]).notNull().default("natural"),
  razonSocial: varchar("razon_social", { length: 191 }),
  nit: varchar("nit", { length: 30 }),
  digitoVerificacion: char("digito_verificacion", { length: 1 }),
  responsableIva: boolean("responsable_iva").notNull().default(false),
  banco: varchar("banco", { length: 80 }),
  tipoCuenta: mysqlEnum("tipo_cuenta", ["ahorros", "corriente"]),
  cuentaToken: varchar("cuenta_token", { length: 191 }),
  cuentaEnmascarada: varchar("cuenta_enmascarada", { length: 30 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/** Caracteriza y empareja. Nunca alimenta el historial de cumplimiento. */
export const perfilesInquilino = mysqlTable("perfiles_inquilino", {
  usuarioId: int("usuario_id", { unsigned: true }).primaryKey(),
  fechaNacimiento: date("fecha_nacimiento"),
  genero: mysqlEnum("genero", ["femenino", "masculino", "no_binario", "otro", "prefiere_no_decir"]),
  tipoVinculacion: mysqlEnum("tipo_vinculacion",
    ["asalariado", "independiente", "estudiante", "pensionado", "desempleado", "otro"]),
  profesion: varchar("profesion", { length: 120 }),
  nivelEducativo: mysqlEnum("nivel_educativo",
    ["primaria", "bachillerato", "tecnico", "universitario", "posgrado", "otro"]),
  empresa: varchar("empresa", { length: 191 }),
  antiguedadLaboralMeses: smallint("antiguedad_laboral_meses", { unsigned: true }),
  rangoIngresos: mysqlEnum("rango_ingresos",
    ["menos_2_smmlv", "2_4_smmlv", "4_6_smmlv", "6_10_smmlv", "mas_10_smmlv"]),
  ingresosMensuales: decimal("ingresos_mensuales", { precision: 14, scale: 2 }),
  diaPreferidoPago: tinyint("dia_preferido_pago", { unsigned: true }),
  numOcupantesHabitual: tinyint("num_ocupantes_habitual", { unsigned: true }),
  numMascotas: tinyint("num_mascotas", { unsigned: true }).notNull().default(0),
  mascotas: json("mascotas"),
  fumador: boolean("fumador"),
  biografia: text("biografia"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const consentimientos = mysqlTable("consentimientos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  usuarioId: int("usuario_id", { unsigned: true }).notNull(),
  tipo: mysqlEnum("tipo", ["tratamiento_datos", "compartir_score", "consulta_centrales",
    "consulta_antecedentes", "comunicaciones"]).notNull(),
  otorgado: boolean("otorgado").notNull(),
  versionPolitica: varchar("version_politica", { length: 20 }).notNull(),
  alcance: json("alcance"),
  otorgadoAt: timestamp("otorgado_at").notNull().defaultNow(),
  revocadoAt: timestamp("revocado_at"),
  ip: varchar("ip", { length: 45 }),
  userAgent: varchar("user_agent", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_consent_usuario_tipo").on(t.usuarioId, t.tipo, t.otorgadoAt)]);

export const archivos = mysqlTable("archivos", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  uuid: char("uuid", { length: 36 }).notNull(),
  s3Key: varchar("s3_key", { length: 500 }).notNull(),
  bucket: varchar("bucket", { length: 120 }).notNull(),
  nombreOriginal: varchar("nombre_original", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 120 }).notNull(),
  tamanoBytes: bigint("tamano_bytes", { mode: "number", unsigned: true }).notNull(),
  subidoPorId: int("subido_por_id", { unsigned: true }),
  entidadTipo: varchar("entidad_tipo", { length: 60 }),
  entidadId: bigint("entidad_id", { mode: "number", unsigned: true }),
  publico: boolean("publico").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uk_archivos_uuid").on(t.uuid),
  index("ix_archivos_entidad").on(t.entidadTipo, t.entidadId),
]);
