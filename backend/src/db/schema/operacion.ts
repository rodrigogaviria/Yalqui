// Operación del inmueble: proveedores, personal, incidencias e inspecciones.
// Generado por introspección de la base ya migrada. Las migraciones siguen
// siendo los .sql versionados: esto es el tipo, no la fuente de verdad.
import {
  mysqlTable, int, bigint, varchar, text, json, tinyint, timestamp, date, decimal, mysqlEnum, unique, index, primaryKey, check, boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

import { contratos } from "./contrato.js";
import { archivos, usuarios } from "./identidad.js";
import { edificaciones, inmuebles } from "./inventario.js";

export const proveedores = mysqlTable("proveedores", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	usuarioId: int("usuario_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	razonSocial: varchar("razon_social", { length: 191 }).notNull(),
	nit: varchar({ length: 30 }),
	especialidades: json(),
	ciudad: varchar({ length: 120 }),
	telefono: varchar({ length: 30 }),
	email: varchar({ length: 191 }),
	calificacionPromedio: decimal("calificacion_promedio", { precision: 3, scale: 2 }),
	trabajosCompletados: int("trabajos_completados", { unsigned: true }).default(0).notNull(),
	activo: boolean("activo").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_proveedores_ciudad").on(table.ciudad, table.activo),
	primaryKey({ columns: [table.id], name: "proveedores_id"}),
]);

export const personalPropiedad = mysqlTable("personal_propiedad", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	usuarioId: int("usuario_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	edificacionId: int("edificacion_id", { unsigned: true }).notNull().references(() => edificaciones.id, { onDelete: "cascade" } ),
	cargo: mysqlEnum(['portero','vigilante','aseo','jardineria','mantenimiento','otro']).notNull(),
	nombre: varchar({ length: 191 }).notNull(),
	telefono: varchar({ length: 30 }),
	turno: mysqlEnum(['dia','noche','rotativo','administrativo']),
	activo: boolean("activo").default(true).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	desde: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	hasta: date({ mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_personal_edificacion").on(table.edificacionId, table.activo),
	index("ix_personal_usuario").on(table.usuarioId),
	primaryKey({ columns: [table.id], name: "personal_propiedad_id"}),
]);

export const permisosRol = mysqlTable("permisos_rol", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	rol: mysqlEnum(['admin_yalqui','administrador_inmueble','propietario','socio_propietario','inquilino','personal_propiedad','proveedor']).notNull(),
	ambitoTipo: mysqlEnum("ambito_tipo", ['global','inmueble','edificacion','contrato']).notNull(),
	permiso: varchar({ length: 64 }).notNull(),
	otorgado: tinyint().default(1).notNull(),
	condicion: varchar({ length: 64 }),
	nota: varchar({ length: 255 }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "permisos_rol_id"}),
	unique("uk_permiso").on(table.rol, table.ambitoTipo, table.permiso),
]);

export const incidencias = mysqlTable("incidencias", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	ambito: mysqlEnum(['unidad','area_comun']).notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).references(() => inmuebles.id, { onDelete: "cascade" } ),
	edificacionId: int("edificacion_id", { unsigned: true }).references(() => edificaciones.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }).references(() => contratos.id, { onDelete: "set null" } ),
	reportadaPorId: int("reportada_por_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "restrict" } ),
	categoria: mysqlEnum(['plomeria','electrico','estructural','electrodomesticos','cerrajeria','humedad','ascensor','otro']).notNull(),
	prioridad: mysqlEnum(['baja','media','alta','urgente']).default('media').notNull(),
	estado: mysqlEnum(['abierta','asignada','en_progreso','espera_aprobacion','resuelta','cerrada','rechazada']).default('abierta').notNull(),
	titulo: varchar({ length: 191 }).notNull(),
	descripcion: text(),
	responsableCosto: mysqlEnum("responsable_costo", ['propietario','inquilino','compartido','copropiedad','por_definir']).default('por_definir').notNull(),
	proveedorId: int("proveedor_id", { unsigned: true }).references(() => proveedores.id, { onDelete: "set null" } ),
	costoEstimado: decimal("costo_estimado", { precision: 14, scale: 2 }),
	costoFinal: decimal("costo_final", { precision: 14, scale: 2 }),
	reportadaAt: timestamp("reportada_at", { mode: 'string' }).defaultNow().notNull(),
	slaVenceAt: timestamp("sla_vence_at", { mode: 'string' }),
	resueltaAt: timestamp("resuelta_at", { mode: 'string' }),
	cerradaAt: timestamp("cerrada_at", { mode: 'string' }),
},
(table) => [
	index("ix_incid_estado_sla").on(table.estado, table.slaVenceAt),
	index("ix_incid_inmueble").on(table.inmuebleId, table.reportadaAt),
	index("ix_incid_edificacion").on(table.edificacionId, table.reportadaAt),
	index("ix_incid_proveedor").on(table.proveedorId),
	primaryKey({ columns: [table.id], name: "incidencias_id"}),
	check("ck_incid_ambito", sql`(((\`ambito\` = _utf8mb4\'unidad\') and (\`inmueble_id\` is not null) and (\`edificacion_id\` is null)) or ((\`ambito\` = _utf8mb4\'area_comun\') and (\`edificacion_id\` is not null) and (\`inmueble_id\` is null)))`),
]);

export const incidenciaEventos = mysqlTable("incidencia_eventos", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	incidenciaId: int("incidencia_id", { unsigned: true }).notNull().references(() => incidencias.id, { onDelete: "cascade" } ),
	autorId: int("autor_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	tipo: mysqlEnum(['comentario','cambio_estado','asignacion','cotizacion','foto','cierre']).notNull(),
	contenido: text(),
	archivoId: bigint("archivo_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_incidev_incidencia").on(table.incidenciaId, table.createdAt),
	primaryKey({ columns: [table.id], name: "incidencia_eventos_id"}),
]);

export const inspecciones = mysqlTable("inspecciones", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).notNull().references(() => inmuebles.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }).references(() => contratos.id, { onDelete: "set null" } ),
	tipo: mysqlEnum(['entrada','periodica','salida']).notNull(),
	realizadaPorId: int("realizada_por_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fecha: date({ mode: 'string' }).notNull(),
	estadoGeneral: mysqlEnum("estado_general", ['excelente','bueno','regular','malo']).notNull(),
	puntaje: decimal({ precision: 5, scale: 2 }),
	items: json(),
	observaciones: text(),
	actaArchivoId: bigint("acta_archivo_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	firmadaPorInquilino: tinyint("firmada_por_inquilino").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_insp_inmueble").on(table.inmuebleId, table.tipo, table.fecha),
	index("ix_insp_contrato").on(table.contratoId),
	primaryKey({ columns: [table.id], name: "inspecciones_id"}),
]);

export const alertas = mysqlTable("alertas", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	tipo: mysqlEnum(['mora','contrato_por_vencer','pago_fallido','pago_por_verificar','incidencia_sla','riesgo_inquilino','score_actualizado','suscripcion_morosa','documento_pendiente','servicio_vencido']).notNull(),
	severidad: mysqlEnum(['info','media','alta','critica']).default('media').notNull(),
	entidadTipo: varchar("entidad_tipo", { length: 60 }).notNull(),
	entidadId: bigint("entidad_id", { mode: "number", unsigned: true }).notNull(),
	destinatarioId: int("destinatario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	titulo: varchar({ length: 191 }).notNull(),
	mensaje: text(),
	estado: mysqlEnum(['nueva','vista','atendida','descartada']).default('nueva').notNull(),
	generadaAt: timestamp("generada_at", { mode: 'string' }).defaultNow().notNull(),
	vistaAt: timestamp("vista_at", { mode: 'string' }),
	atendidaAt: timestamp("atendida_at", { mode: 'string' }),
},
(table) => [
	index("ix_alertas_destinatario").on(table.destinatarioId, table.estado, table.generadaAt),
	index("ix_alertas_entidad").on(table.entidadTipo, table.entidadId),
	primaryKey({ columns: [table.id], name: "alertas_id"}),
]);

export const auditoria = mysqlTable("auditoria", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	actorId: int("actor_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	accion: varchar({ length: 80 }).notNull(),
	entidadTipo: varchar("entidad_tipo", { length: 60 }).notNull(),
	entidadId: bigint("entidad_id", { mode: "number", unsigned: true }).notNull(),
	antes: json(),
	despues: json(),
	ip: varchar({ length: 45 }),
	userAgent: varchar("user_agent", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_auditoria_entidad").on(table.entidadTipo, table.entidadId, table.createdAt),
	index("ix_auditoria_actor").on(table.actorId, table.createdAt),
	primaryKey({ columns: [table.id], name: "auditoria_id"}),
]);

export const cotizaciones = mysqlTable("cotizaciones", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	incidenciaId: int("incidencia_id", { unsigned: true }).notNull().references(() => incidencias.id, { onDelete: "cascade" } ),
	proveedorId: int("proveedor_id", { unsigned: true }).notNull().references(() => proveedores.id, { onDelete: "cascade" } ),
	monto: decimal({ precision: 14, scale: 2 }).notNull(),
	descripcion: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	validezHasta: date("validez_hasta", { mode: 'string' }),
	estado: mysqlEnum(['enviada','aceptada','rechazada','expirada']).default('enviada').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "cotizaciones_id"}),
	unique("uk_cotizacion").on(table.incidenciaId, table.proveedorId),
]);
