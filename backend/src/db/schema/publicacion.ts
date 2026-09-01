// Promoción externa, precio sugerido y lo que se paga aparte del canon.
// Generado por introspección de la base ya migrada. Las migraciones siguen
// siendo los .sql versionados: esto es el tipo, no la fuente de verdad.
import {
  mysqlTable, int, bigint, varchar, char, text, json, tinyint, timestamp, date, decimal, mysqlEnum, unique, index, primaryKey, boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

import { archivos, usuarios } from "./identidad.js";
import { catalogoAjustes, edificaciones, inmuebles } from "./inventario.js";
import { serviciosContratados } from "./negocio.js";

export const canalesPublicacion = mysqlTable("canales_publicacion", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	codigo: mysqlEnum(['facebook_page','instagram','meta_catalog','marketplace_partner','portal_externo']).notNull(),
	nombre: varchar({ length: 120 }).notNull(),
	proveedor: varchar({ length: 60 }),
	requiereAprobacion: tinyint("requiere_aprobacion").default(0).notNull(),
	estado: mysqlEnum(['disponible','no_disponible','en_gestion']).default('no_disponible').notNull(),
	paises: json(),
	costoPorPublicacion: decimal("costo_por_publicacion", { precision: 10, scale: 2 }),
	limiteFotos: tinyint("limite_fotos", { unsigned: true }),
	requisitos: json(),
	activo: boolean("activo").default(true).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "canales_publicacion_id"}),
	unique("uk_canalpub_codigo").on(table.codigo),
]);

export const publicacionesExternas = mysqlTable("publicaciones_externas", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).notNull().references(() => inmuebles.id, { onDelete: "cascade" } ),
	canalId: int("canal_id", { unsigned: true }).notNull().references(() => canalesPublicacion.id, { onDelete: "restrict" } ),
	publicadaPorId: int("publicada_por_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	estado: mysqlEnum(['borrador','en_revision','publicada','rechazada','pausada','expirada','eliminada']).default('borrador').notNull(),
	idExterno: varchar("id_externo", { length: 191 }),
	urlExterna: varchar("url_externa", { length: 500 }),
	titulo: varchar({ length: 191 }),
	cuerpo: text(),
	fotosIncluidas: json("fotos_incluidas"),
	respuesta: json(),
	motivoRechazo: varchar("motivo_rechazo", { length: 255 }),
	publicadaAt: timestamp("publicada_at", { mode: 'string' }),
	expiraAt: timestamp("expira_at", { mode: 'string' }),
	ultimaSyncAt: timestamp("ultima_sync_at", { mode: 'string' }),
},
(table) => [
	index("ix_pubext_inmueble").on(table.inmuebleId, table.estado),
	primaryKey({ columns: [table.id], name: "publicaciones_externas_id"}),
	unique("uk_pubext_externo").on(table.canalId, table.idExterno),
]);

export const valoraciones = mysqlTable("valoraciones", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).notNull().references(() => inmuebles.id, { onDelete: "cascade" } ),
	servicioContratadoId: int("servicio_contratado_id", { unsigned: true }).references(() => serviciosContratados.id, { onDelete: "set null" } ),
	canonSugerido: decimal("canon_sugerido", { precision: 14, scale: 2 }).notNull(),
	rangoMin: decimal("rango_min", { precision: 14, scale: 2 }),
	rangoMax: decimal("rango_max", { precision: 14, scale: 2 }),
	ocupantesBase: tinyint("ocupantes_base", { unsigned: true }),
	costoServiciosIncluidos: decimal("costo_servicios_incluidos", { precision: 14, scale: 2 }),
	confianza: decimal({ precision: 4, scale: 3 }),
	versionModelo: varchar("version_modelo", { length: 40 }).notNull(),
	comparables: json(),
	supuestos: json(),
	generadaAt: timestamp("generada_at", { mode: 'string' }).defaultNow().notNull(),
	aplicada: tinyint().default(0).notNull(),
	aplicadaAt: timestamp("aplicada_at", { mode: 'string' }),
},
(table) => [
	index("ix_valoracion_inmueble").on(table.inmuebleId, table.generadaAt),
	primaryKey({ columns: [table.id], name: "valoraciones_id"}),
]);

export const valoracionAjustes = mysqlTable("valoracion_ajustes", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	valoracionId: int("valoracion_id", { unsigned: true }).notNull().references(() => valoraciones.id, { onDelete: "cascade" } ),
	ajusteId: int("ajuste_id", { unsigned: true }).notNull().references(() => catalogoAjustes.id, { onDelete: "restrict" } ),
	valorSugerido: decimal("valor_sugerido", { precision: 14, scale: 2 }).notNull(),
	rangoMin: decimal("rango_min", { precision: 14, scale: 2 }),
	rangoMax: decimal("rango_max", { precision: 14, scale: 2 }),
	baseCalculo: mysqlEnum("base_calculo", ['comparables','costo_marginal','mixto']).default('comparables').notNull(),
	justificacion: varchar({ length: 255 }),
	confianza: decimal({ precision: 4, scale: 3 }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "valoracion_ajustes_id"}),
	unique("uk_valajuste").on(table.valoracionId, table.ajusteId),
]);

export const publicacionMetricas = mysqlTable("publicacion_metricas", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	publicacionId: int("publicacion_id", { unsigned: true }).notNull().references(() => publicacionesExternas.id, { onDelete: "cascade" } ),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fecha: date({ mode: 'string' }).notNull(),
	impresiones: int({ unsigned: true }).default(0).notNull(),
	clics: int({ unsigned: true }).default(0).notNull(),
	mensajes: int({ unsigned: true }).default(0).notNull(),
	guardados: int({ unsigned: true }).default(0).notNull(),
	costo: decimal({ precision: 10, scale: 2 }),
	sincronizadoAt: timestamp("sincronizado_at", { mode: 'string' }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "publicacion_metricas_id"}),
	unique("uk_pubmetrica").on(table.publicacionId, table.fecha),
]);

export const empresasServicioPublico = mysqlTable("empresas_servicio_publico", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	codigo: varchar({ length: 40 }).notNull(),
	nombre: varchar({ length: 120 }).notNull(),
	tipoServicio: mysqlEnum("tipo_servicio", ['energia','acueducto','gas','aseo','internet','tv','telefonia']).notNull(),
	ciudades: json(),
	tieneApi: tinyint("tiene_api").default(0).notNull(),
	metodoConsulta: mysqlEnum("metodo_consulta", ['api','scraping','comprobante','ninguno']).default('comprobante').notNull(),
	urlPortal: varchar("url_portal", { length: 255 }),
	activo: boolean("activo").default(true).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "empresas_servicio_publico_id"}),
	unique("uk_empservp_codigo").on(table.codigo),
]);

export const cuentasCobro = mysqlTable("cuentas_cobro", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).notNull().references(() => inmuebles.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['energia','acueducto','gas','aseo','internet','tv','telefonia','administracion','cuota_extraordinaria']).notNull(),
	empresaId: int("empresa_id", { unsigned: true }).references(() => empresasServicioPublico.id, { onDelete: "set null" } ),
	edificacionId: int("edificacion_id", { unsigned: true }).references(() => edificaciones.id, { onDelete: "set null" } ),
	numeroCuenta: varchar("numero_cuenta", { length: 60 }),
	titular: mysqlEnum(['propietario','inquilino','administracion']).default('propietario').notNull(),
	responsablePago: mysqlEnum("responsable_pago", ['propietario','inquilino']).default('inquilino').notNull(),
	incluidoEnCanon: tinyint("incluido_en_canon").default(0).notNull(),
	promedioMensual: decimal("promedio_mensual", { precision: 14, scale: 2 }),
	topeIncluido: decimal("tope_incluido", { precision: 14, scale: 2 }),
	diaVencimiento: tinyint("dia_vencimiento", { unsigned: true }),
	activo: boolean("activo").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ix_cuentacobro_inmueble").on(table.inmuebleId, table.activo, table.responsablePago),
	primaryKey({ columns: [table.id], name: "cuentas_cobro_id"}),
	unique("uk_cuentacobro").on(table.inmuebleId, table.tipo, table.numeroCuenta),
]);

export const facturasCobro = mysqlTable("facturas_cobro", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	cuentaId: int("cuenta_id", { unsigned: true }).notNull().references(() => cuentasCobro.id, { onDelete: "cascade" } ),
	periodo: char({ length: 7 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaEmision: date("fecha_emision", { mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaVencimiento: date("fecha_vencimiento", { mode: 'string' }),
	valor: decimal({ precision: 14, scale: 2 }),
	consumo: decimal({ precision: 12, scale: 2 }),
	unidadConsumo: varchar("unidad_consumo", { length: 20 }),
	estado: mysqlEnum(['pendiente','reportada','verificada','pagada','vencida','en_acuerdo','desconocido']).default('desconocido').notNull(),
	pagadaAt: timestamp("pagada_at", { mode: 'string' }),
	fuente: mysqlEnum(['api','comprobante','manual']).default('comprobante').notNull(),
	comprobanteArchivoId: bigint("comprobante_archivo_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	reportadoPorId: int("reportado_por_id", { unsigned: true }),
	verificadoPorId: int("verificado_por_id", { unsigned: true }),
	verificadoAt: timestamp("verificado_at", { mode: 'string' }),
	sincronizadoAt: timestamp("sincronizado_at", { mode: 'string' }),
	respuesta: json(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_factcobro_estado").on(table.estado, table.fechaVencimiento),
	primaryKey({ columns: [table.id], name: "facturas_cobro_id"}),
	unique("uk_factcobro").on(table.cuentaId, table.periodo),
]);
