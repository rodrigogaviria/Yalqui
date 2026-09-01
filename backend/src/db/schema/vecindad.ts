// Vecinos, convivencia y negociación.
// Generado por introspección de la base ya migrada. Las migraciones siguen
// siendo los .sql versionados: esto es el tipo, no la fuente de verdad.
import {
  mysqlTable, int, varchar, text, tinyint, smallint, timestamp, decimal, mysqlEnum, unique, index, primaryKey, boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

import { contratos } from "./contrato.js";
import { aplicaciones } from "./demanda.js";
import { usuarios } from "./identidad.js";
import { edificaciones, inmuebles } from "./inventario.js";

export const solicitudesAyuda = mysqlTable("solicitudes_ayuda", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	solicitanteId: int("solicitante_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	inmuebleId: int("inmueble_id", { unsigned: true }).notNull().references(() => inmuebles.id, { onDelete: "cascade" } ),
	edificacionId: int("edificacion_id", { unsigned: true }).references(() => edificaciones.id, { onDelete: "set null" } ),
	categoria: mysqlEnum(['emergencia','domicilio','prestamo','mascota','acompanamiento','otro']).notNull(),
	urgencia: mysqlEnum(['normal','alta','emergencia']).default('normal').notNull(),
	titulo: varchar({ length: 191 }).notNull(),
	descripcion: text(),
	ubicacionAproximada: varchar("ubicacion_aproximada", { length: 120 }),
	estado: mysqlEnum(['abierta','con_ofertas','aceptada','completada','expirada','cancelada']).default('abierta').notNull(),
	aceptadaId: int("aceptada_id", { unsigned: true }),
	expiraAt: timestamp("expira_at", { mode: 'string' }),
	completadaAt: timestamp("completada_at", { mode: 'string' }),
	confirmadaPorSolicitante: tinyint("confirmada_por_solicitante").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_ayuda_edificacion").on(table.edificacionId, table.estado, table.createdAt),
	primaryKey({ columns: [table.id], name: "solicitudes_ayuda_id"}),
]);

export const ayudaRespuestas = mysqlTable("ayuda_respuestas", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	solicitudId: int("solicitud_id", { unsigned: true }).notNull().references(() => solicitudesAyuda.id, { onDelete: "cascade" } ),
	vecinoId: int("vecino_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	mensaje: varchar({ length: 500 }),
	estado: mysqlEnum(['ofrecida','aceptada','descartada','completada']).default('ofrecida').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "ayuda_respuestas_id"}),
	unique("uk_ayudaresp").on(table.solicitudId, table.vecinoId),
]);

export const pqrs = mysqlTable("pqrs", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).references(() => inmuebles.id, { onDelete: "set null" } ),
	edificacionId: int("edificacion_id", { unsigned: true }).references(() => edificaciones.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }),
	senaladoId: int("senalado_id", { unsigned: true }).references(() => usuarios.id, { onDelete: "set null" } ),
	tipo: mysqlEnum(['peticion','queja','reclamo','sugerencia','felicitacion']).notNull(),
	categoria: mysqlEnum(['ruido','mascotas','basuras','parqueadero','areas_comunes','dano','convivencia','otro']).notNull(),
	origen: mysqlEnum(['vecino','administracion','propietario','inquilino','porteria']).notNull(),
	reportanteNombre: varchar("reportante_nombre", { length: 191 }),
	reportanteAnonimo: tinyint("reportante_anonimo").default(0).notNull(),
	descripcion: text().notNull(),
	gravedad: mysqlEnum(['leve','moderada','grave']).default('leve').notNull(),
	estado: mysqlEnum(['recibida','en_revision','en_descargos','resuelta_en_contra','resuelta_a_favor','desestimada']).default('recibida').notNull(),
	descargos: text(),
	resolucion: text(),
	resueltaPorId: int("resuelta_por_id", { unsigned: true }),
	confirmadaPorPropietario: tinyint("confirmada_por_propietario").default(0).notNull(),
	confirmadaAt: timestamp("confirmada_at", { mode: 'string' }),
	recibidaAt: timestamp("recibida_at", { mode: 'string' }).defaultNow().notNull(),
	resueltaAt: timestamp("resuelta_at", { mode: 'string' }),
},
(table) => [
	index("ix_pqrs_edificacion").on(table.edificacionId, table.recibidaAt),
	index("ix_pqrs_senalado").on(table.senaladoId, table.estado),
	primaryKey({ columns: [table.id], name: "pqrs_id"}),
]);

export const inquilinoAtributos = mysqlTable("inquilino_atributos", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	usuarioId: int("usuario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['hobby','habilidad','idioma','certificacion']).notNull(),
	valor: varchar({ length: 191 }).notNull(),
	verificado: tinyint().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_inqatr_busqueda").on(table.tipo, table.valor),
	primaryKey({ columns: [table.id], name: "inquilino_atributos_id"}),
	unique("uk_inqatr").on(table.usuarioId, table.tipo, table.valor),
]);

export const negociaciones = mysqlTable("negociaciones", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	aplicacionId: int("aplicacion_id", { unsigned: true }).references(() => aplicaciones.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }).references(() => contratos.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['canon_inicial','renovacion']).notNull(),
	estado: mysqlEnum(['abierta','aceptada','rechazada','expirada']).default('abierta').notNull(),
	expiraAt: timestamp("expira_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_negoc_aplicacion").on(table.aplicacionId),
	index("ix_negoc_contrato").on(table.contratoId),
	primaryKey({ columns: [table.id], name: "negociaciones_id"}),
]);

export const negociacionOfertas = mysqlTable("negociacion_ofertas", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	negociacionId: int("negociacion_id", { unsigned: true }).notNull().references(() => negociaciones.id, { onDelete: "cascade" } ),
	autorId: int("autor_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "restrict" } ),
	canonPropuesto: decimal("canon_propuesto", { precision: 14, scale: 2 }).notNull(),
	mesesPropuestos: smallint("meses_propuestos", { unsigned: true }),
	condiciones: text(),
	estado: mysqlEnum(['vigente','aceptada','rechazada','superada']).default('vigente').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_negofer_negociacion").on(table.negociacionId, table.createdAt),
	primaryKey({ columns: [table.id], name: "negociacion_ofertas_id"}),
]);

export const amenidades = mysqlTable("amenidades", {
	codigo: varchar({ length: 40 }).notNull(),
	nombre: varchar({ length: 120 }).notNull(),
	categoria: mysqlEnum(['edificio','unidad','zona']).notNull(),
	icono: varchar({ length: 40 }),
	activo: boolean("activo").default(true).notNull(),
},
(table) => [
	primaryKey({ columns: [table.codigo], name: "amenidades_codigo"}),
]);

export const inmuebleAmenidades = mysqlTable("inmueble_amenidades", {
	inmuebleId: int("inmueble_id", { unsigned: true }).notNull().references(() => inmuebles.id, { onDelete: "cascade" } ),
	amenidadCodigo: varchar("amenidad_codigo", { length: 40 }).notNull().references(() => amenidades.codigo, { onDelete: "cascade" } ),
},
(table) => [
	index("ix_inmamen_amenidad").on(table.amenidadCodigo),
	primaryKey({ columns: [table.inmuebleId, table.amenidadCodigo], name: "inmueble_amenidades_inmueble_id_amenidad_codigo"}),
]);
