// Todo lo que sale y entra, con la ventana de 24 horas de WhatsApp.
// Generado por introspección de la base ya migrada. Las migraciones siguen
// siendo los .sql versionados: esto es el tipo, no la fuente de verdad.
import {
  mysqlTable, int, bigint, varchar, char, text, json, tinyint, smallint, timestamp, mysqlEnum, unique, index, primaryKey, boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

import { usuarios } from "./identidad.js";
import { edificaciones, inmuebles } from "./inventario.js";

export const plantillasMensaje = mysqlTable("plantillas_mensaje", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	codigo: varchar({ length: 60 }).notNull(),
	nombre: varchar({ length: 120 }).notNull(),
	canal: mysqlEnum(['whatsapp','email','sms','push','app']).notNull(),
	categoria: mysqlEnum(['cobranza','comunicado','transaccional','incidencia','contrato','comercial']).notNull(),
	asunto: varchar({ length: 191 }),
	cuerpo: text().notNull(),
	variables: json(),
	idioma: char({ length: 5 }).default('es_CO').notNull(),
	nombreMeta: varchar("nombre_meta", { length: 120 }),
	categoriaMeta: mysqlEnum("categoria_meta", ['utility','authentication','marketing']),
	estadoAprobacion: mysqlEnum("estado_aprobacion", ['borrador','en_revision','aprobada','rechazada','pausada']).default('borrador').notNull(),
	motivoRechazo: varchar("motivo_rechazo", { length: 255 }),
	version: smallint({ unsigned: true }).default(1).notNull(),
	activo: boolean("activo").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ix_plantilla_canal").on(table.canal, table.estadoAprobacion),
	primaryKey({ columns: [table.id], name: "plantillas_mensaje_id"}),
	unique("uk_plantilla").on(table.codigo, table.idioma, table.version),
]);

export const conversacionesWhatsapp = mysqlTable("conversaciones_whatsapp", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	telefono: varchar({ length: 30 }).notNull(),
	usuarioId: int("usuario_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	ultimoEntranteAt: timestamp("ultimo_entrante_at", { mode: 'string' }),
	ventanaExpiraAt: timestamp("ventana_expira_at", { mode: 'string' }),
	estado: mysqlEnum(['abierta','cerrada','opt_out','bloqueado']).default('cerrada').notNull(),
	optOutAt: timestamp("opt_out_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ix_convwa_ventana").on(table.ventanaExpiraAt),
	primaryKey({ columns: [table.id], name: "conversaciones_whatsapp_id"}),
	unique("uk_convwa_telefono").on(table.telefono),
]);

export const comunicados = mysqlTable("comunicados", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	autorId: int("autor_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "restrict" } ),
	ambito: mysqlEnum(['unidad','contrato','portafolio','edificacion','global']).notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).references(() => inmuebles.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }),
	propietarioId: int("propietario_id", { unsigned: true }),
	edificacionId: int("edificacion_id", { unsigned: true }).references(() => edificaciones.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['aviso','mantenimiento','incremento_canon','recordatorio','emergencia','normativo','comercial']).notNull(),
	titulo: varchar({ length: 191 }).notNull(),
	cuerpo: text().notNull(),
	prioridad: mysqlEnum(['baja','normal','alta','urgente']).default('normal').notNull(),
	requiereConfirmacion: boolean("requiere_confirmacion").default(false).notNull(),
	canales: json().notNull(),
	plantillaId: int("plantilla_id", { unsigned: true }).references(() => plantillasMensaje.id, { onDelete: "set null" } ),
	adjuntoArchivoId: bigint("adjunto_archivo_id", { mode: "number", unsigned: true }),
	estado: mysqlEnum(['borrador','programado','enviando','enviado','cancelado']).default('borrador').notNull(),
	programadoPara: timestamp("programado_para", { mode: 'string' }),
	enviadoAt: timestamp("enviado_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_comunicado_ambito").on(table.ambito, table.inmuebleId),
	index("ix_comunicado_cola").on(table.estado, table.programadoPara),
	primaryKey({ columns: [table.id], name: "comunicados_id"}),
]);

export const comunicadoDestinatarios = mysqlTable("comunicado_destinatarios", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	comunicadoId: int("comunicado_id", { unsigned: true }).notNull().references(() => comunicados.id, { onDelete: "cascade" } ),
	usuarioId: int("usuario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	rolDestinatario: mysqlEnum("rol_destinatario", ['inquilino','propietario','garante','proveedor']).notNull(),
	estado: mysqlEnum(['pendiente','enviado','entregado','leido','confirmado','fallido']).default('pendiente').notNull(),
	leidoAt: timestamp("leido_at", { mode: 'string' }),
	confirmadoAt: timestamp("confirmado_at", { mode: 'string' }),
},
(table) => [
	index("ix_comdest_usuario").on(table.usuarioId, table.estado),
	primaryKey({ columns: [table.id], name: "comunicado_destinatarios_id"}),
	unique("uk_comdest").on(table.comunicadoId, table.usuarioId),
]);

export const preferenciasNotificacion = mysqlTable("preferencias_notificacion", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	usuarioId: int("usuario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	categoria: mysqlEnum(['cobranza','comunicado','incidencia','contrato','score','vecinos','comercial']).notNull(),
	canal: mysqlEnum(['whatsapp','email','sms','push','app']).notNull(),
	habilitado: tinyint().default(1).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "preferencias_notificacion_id"}),
	unique("uk_prefnotif").on(table.usuarioId, table.categoria, table.canal),
]);

export const eventosWebhook = mysqlTable("eventos_webhook", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	proveedor: varchar({ length: 60 }).notNull(),
	idEventoExterno: varchar("id_evento_externo", { length: 191 }).notNull(),
	tipo: varchar({ length: 80 }),
	cuerpo: json().notNull(),
	firmaValida: tinyint("firma_valida").default(0).notNull(),
	procesadoAt: timestamp("procesado_at", { mode: 'string' }),
	error: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_webhook_pendientes").on(table.procesadoAt),
	primaryKey({ columns: [table.id], name: "eventos_webhook_id"}),
	unique("uk_webhook_evento").on(table.proveedor, table.idEventoExterno),
]);
