// Verificación externa y score de comportamiento. Dos números que nunca se promedian:
// el de verificaciones es crediticio y externo; el del score, de conducta e interno.
// Generado por introspección de la base ya migrada. Las migraciones siguen
// siendo los .sql versionados: esto es el tipo, no la fuente de verdad.
import {
  mysqlTable, int, bigint, varchar, char, text, json, tinyint, smallint, timestamp, date, decimal, mysqlEnum, unique, index, primaryKey, boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

import { contratos } from "./contrato.js";
import { aplicaciones } from "./demanda.js";
import { consentimientos, usuarios } from "./identidad.js";

export const proveedoresVerificacion = mysqlTable("proveedores_verificacion", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	codigo: varchar({ length: 40 }).notNull(),
	nombre: varchar({ length: 120 }).notNull(),
	tiposSoportados: json("tipos_soportados").notNull(),
	modo: mysqlEnum(['api','manual']).default('api').notNull(),
	costoConsulta: decimal("costo_consulta", { precision: 10, scale: 2 }),
	vigenciaDias: smallint("vigencia_dias", { unsigned: true }).default(90).notNull(),
	config: json(),
	activo: boolean("activo").default(true).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "proveedores_verificacion_id"}),
	unique("uk_provverif_codigo").on(table.codigo),
]);

export const verificaciones = mysqlTable("verificaciones", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	usuarioId: int("usuario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	proveedorId: int("proveedor_id", { unsigned: true }).references(() => proveedoresVerificacion.id, { onDelete: "set null" } ),
	consentimientoId: int("consentimiento_id", { unsigned: true }).references(() => consentimientos.id, { onDelete: "set null" } ),
	servicioContratadoId: int("servicio_contratado_id", { unsigned: true }),
	tipo: mysqlEnum(['identidad','documento','antecedentes_judiciales','antecedentes_policiales','listas_restrictivas','centrales_riesgo','laboral']).notNull(),
	estado: mysqlEnum(['solicitada','en_proceso','completada','fallida','expirada']).default('solicitada').notNull(),
	resultado: mysqlEnum(['aprobado','con_observaciones','rechazado']),
	motivoFallo: mysqlEnum("motivo_fallo", ['consentimiento_faltante','datos_invalidos','sujeto_no_encontrado','proveedor_no_disponible','resultado_parcial','credenciales_invalidas','cuota_excedida','timeout_proveedor']),
	score: decimal({ precision: 6, scale: 2 }),
	escalaMin: smallint("escala_min", { unsigned: true }),
	escalaMax: smallint("escala_max", { unsigned: true }),
	cuotaMensualEstimada: decimal("cuota_mensual_estimada", { precision: 14, scale: 2 }),
	hallazgos: json(),
	respuesta: json(),
	idExterno: varchar("id_externo", { length: 120 }),
	costo: decimal({ precision: 10, scale: 2 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenteHasta: date("vigente_hasta", { mode: 'string' }),
	solicitadaAt: timestamp("solicitada_at", { mode: 'string' }).defaultNow().notNull(),
	completadaAt: timestamp("completada_at", { mode: 'string' }),
},
(table) => [
	index("ix_verif_usuario").on(table.usuarioId, table.tipo, table.vigenteHasta),
	index("ix_verif_estado").on(table.estado, table.solicitadaAt),
	primaryKey({ columns: [table.id], name: "verificaciones_id"}),
	unique("uk_verif_externo").on(table.proveedorId, table.idExterno),
]);

export const aplicacionVerificaciones = mysqlTable("aplicacion_verificaciones", {
	aplicacionId: int("aplicacion_id", { unsigned: true }).notNull().references(() => aplicaciones.id, { onDelete: "cascade" } ),
	verificacionId: int("verificacion_id", { unsigned: true }).notNull().references(() => verificaciones.id, { onDelete: "cascade" } ),
	adjuntadaAt: timestamp("adjuntada_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_aplverif_verificacion").on(table.verificacionId),
	primaryKey({ columns: [table.aplicacionId, table.verificacionId], name: "aplicacion_verificaciones_aplicacion_id_verificacion_id"}),
]);

export const garantes = mysqlTable("garantes", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	aplicacionId: int("aplicacion_id", { unsigned: true }).references(() => aplicaciones.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }).references(() => contratos.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['codeudor','coarrendatario','fiador','poliza']).notNull(),
	usuarioId: int("usuario_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	nombre: varchar({ length: 191 }).notNull(),
	tipoDocumento: mysqlEnum("tipo_documento", ['CC','CE','NIT','PA']),
	numeroDocumento: varchar("numero_documento", { length: 40 }),
	telefono: varchar({ length: 30 }),
	email: varchar({ length: 191 }),
	aseguradora: varchar({ length: 120 }),
	numeroPoliza: varchar("numero_poliza", { length: 60 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenciaHasta: date("vigencia_hasta", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_garantes_aplicacion").on(table.aplicacionId),
	index("ix_garantes_contrato").on(table.contratoId),
	primaryKey({ columns: [table.id], name: "garantes_id"}),
]);

export const dimensionesScore = mysqlTable("dimensiones_score", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	codigo: mysqlEnum(['pagos','cuidado_inmueble','convivencia','comunicacion','documentacion']).notNull(),
	nombre: varchar({ length: 120 }).notNull(),
	descripcion: varchar({ length: 255 }),
	explicacionPublica: text("explicacion_publica"),
	comoMejorar: text("como_mejorar"),
	peso: decimal({ precision: 4, scale: 3 }).notNull(),
	puntajeBase: decimal("puntaje_base", { precision: 5, scale: 2 }).default('70.00').notNull(),
	ventanaMeses: smallint("ventana_meses", { unsigned: true }).default(24).notNull(),
	calculo: mysqlEnum(['automatico','manual','mixto']).default('automatico').notNull(),
	activo: boolean("activo").default(true).notNull(),
	orden: smallint({ unsigned: true }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenteDesde: date("vigente_desde", { mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenteHasta: date("vigente_hasta", { mode: 'string' }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "dimensiones_score_id"}),
	unique("uk_dimscore_codigo").on(table.codigo, table.vigenteDesde),
]);

export const eventosScore = mysqlTable("eventos_score", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	inquilinoId: int("inquilino_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }).references(() => contratos.id, { onDelete: "set null" } ),
	dimensionId: int("dimension_id", { unsigned: true }).notNull().references(() => dimensionesScore.id, { onDelete: "restrict" } ),
	tipoEvento: mysqlEnum("tipo_evento", ['pago_puntual','pago_tardio','pago_incumplido','acuerdo_cumplido','dano_atribuible','inspeccion_favorable','inspeccion_desfavorable','queja_confirmada','norma_incumplida','respuesta_oportuna','documento_tardio','contrato_renovado','entrega_sin_novedad','ayuda_vecino']).notNull(),
	impacto: decimal({ precision: 5, scale: 2 }).notNull(),
	origenTipo: mysqlEnum("origen_tipo", ['pago_arriendo','incidencia','pqrs','inspeccion','contrato','ayuda_vecino','manual']).notNull(),
	origenId: bigint("origen_id", { mode: "number", unsigned: true }),
	descripcion: varchar({ length: 255 }),
	explicacionPublica: varchar("explicacion_publica", { length: 255 }).notNull(),
	registradoPorId: int("registrado_por_id", { unsigned: true }),
	estado: mysqlEnum(['vigente','en_reclamo','anulado']).default('vigente').notNull(),
	motivoAnulacion: varchar("motivo_anulacion", { length: 255 }),
	anuladoPorId: int("anulado_por_id", { unsigned: true }),
	anuladoAt: timestamp("anulado_at", { mode: 'string' }),
	ocurridoAt: timestamp("ocurrido_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_evscore_inquilino").on(table.inquilinoId, table.ocurridoAt),
	index("ix_evscore_dimension").on(table.dimensionId),
	primaryKey({ columns: [table.id], name: "eventos_score_id"}),
	unique("uk_evscore_origen").on(table.origenTipo, table.origenId, table.tipoEvento),
]);

export const scoresInquilino = mysqlTable("scores_inquilino", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	inquilinoId: int("inquilino_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	puntajeGlobal: decimal("puntaje_global", { precision: 5, scale: 2 }).notNull(),
	puntajeAnterior: decimal("puntaje_anterior", { precision: 5, scale: 2 }),
	delta: decimal({ precision: 5, scale: 2 }),
	nivel: mysqlEnum(['excelente','bueno','regular','riesgo','critico']).notNull(),
	numContratos: smallint("num_contratos", { unsigned: true }).notNull(),
	mesesHistoria: smallint("meses_historia", { unsigned: true }).notNull(),
	numEventos: int("num_eventos", { unsigned: true }).default(0).notNull(),
	versionModelo: varchar("version_modelo", { length: 20 }).notNull(),
	vigente: tinyint().default(1).notNull(),
	calculadoAt: timestamp("calculado_at", { mode: 'string' }).defaultNow().notNull(),
	vigenteUk: int("vigente_uk", { unsigned: true }).generatedAlwaysAs(sql`if(\`vigente\`,\`inquilino_id\`,NULL)`, { mode: "virtual" }),
},
(table) => [
	index("ix_score_inquilino").on(table.inquilinoId, table.calculadoAt),
	primaryKey({ columns: [table.id], name: "scores_inquilino_id"}),
	unique("uk_score_vigente").on(table.vigenteUk),
]);

export const scoreDimensiones = mysqlTable("score_dimensiones", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	scoreId: int("score_id", { unsigned: true }).notNull().references(() => scoresInquilino.id, { onDelete: "cascade" } ),
	dimensionId: int("dimension_id", { unsigned: true }).notNull().references(() => dimensionesScore.id, { onDelete: "restrict" } ),
	puntaje: decimal({ precision: 5, scale: 2 }).notNull(),
	pesoAplicado: decimal("peso_aplicado", { precision: 4, scale: 3 }).notNull(),
	numEventos: int("num_eventos", { unsigned: true }).default(0).notNull(),
	tendencia: mysqlEnum(['sube','estable','baja']).default('estable').notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "score_dimensiones_id"}),
	unique("uk_scoredim").on(table.scoreId, table.dimensionId),
]);

export const analisisIa = mysqlTable("analisis_ia", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	entidadTipo: mysqlEnum("entidad_tipo", ['precalificacion','aplicacion_documento','incidencia_foto','inmueble_foto']).notNull(),
	entidadId: bigint("entidad_id", { mode: "number", unsigned: true }).notNull(),
	tarea: mysqlEnum(['extraccion','normalizacion_ingreso','inconsistencia','autenticidad_documento','resumen','riesgo']).notNull(),
	modelo: varchar({ length: 80 }).notNull(),
	versionModelo: varchar("version_modelo", { length: 40 }),
	entradaHash: char("entrada_hash", { length: 64 }),
	salida: json(),
	confianza: decimal({ precision: 4, scale: 3 }),
	hallazgos: json(),
	requiereRevisionHumana: tinyint("requiere_revision_humana").default(0).notNull(),
	revisadoPorId: int("revisado_por_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	revisadoAt: timestamp("revisado_at", { mode: 'string' }),
	decisionHumana: mysqlEnum("decision_humana", ['confirmada','corregida','descartada']),
	costo: decimal({ precision: 10, scale: 4 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_ia_entidad").on(table.entidadTipo, table.entidadId),
	index("ix_ia_revision").on(table.tarea, table.requiereRevisionHumana),
	primaryKey({ columns: [table.id], name: "analisis_ia_id"}),
]);
