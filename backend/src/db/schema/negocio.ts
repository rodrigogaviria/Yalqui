// El dinero que Yalqui sí cobra, y el ciclo de vida del contrato en el tiempo.
// Generado por introspección de la base ya migrada. Las migraciones siguen
// siendo los .sql versionados: esto es el tipo, no la fuente de verdad.
import {
  mysqlTable, int, bigint, varchar, char, json, tinyint, smallint, timestamp, date, decimal, mysqlEnum, unique, index, primaryKey, check, boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

import { contratos } from "./contrato.js";
import { planes, suscripciones } from "./dinero.js";
import { archivos, usuarios } from "./identidad.js";
import { edificaciones, inmuebles } from "./inventario.js";
import { inspecciones } from "./operacion.js";

export const servicios = mysqlTable("servicios", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	codigo: mysqlEnum(['pricing_engine','legal','screening','negotiate','cobranza','seguro_arrendamiento','factoraje','promocion']).notNull(),
	nombre: varchar({ length: 120 }).notNull(),
	descripcion: varchar({ length: 255 }),
	modeloCobro: mysqlEnum("modelo_cobro", ['unico','recurrente','por_uso','porcentaje']).notNull(),
	precioBase: decimal("precio_base", { precision: 14, scale: 2 }),
	porcentaje: decimal({ precision: 6, scale: 3 }),
	moneda: char({ length: 3 }).default('COP').notNull(),
	requiereContrato: tinyint("requiere_contrato").default(0).notNull(),
	activo: boolean("activo").default(true).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "servicios_id"}),
	unique("uk_servicios_codigo").on(table.codigo),
]);

export const serviciosContratados = mysqlTable("servicios_contratados", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	propietarioId: int("propietario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	servicioId: int("servicio_id", { unsigned: true }).notNull().references(() => servicios.id, { onDelete: "restrict" } ),
	inmuebleId: int("inmueble_id", { unsigned: true }).notNull().references(() => inmuebles.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }).references(() => contratos.id, { onDelete: "set null" } ),
	estado: mysqlEnum(['solicitado','activo','completado','cancelado']).default('solicitado').notNull(),
	precioAcordado: decimal("precio_acordado", { precision: 14, scale: 2 }).notNull(),
	parametros: json(),
	solicitadoAt: timestamp("solicitado_at", { mode: 'string' }).defaultNow().notNull(),
	inicioAt: timestamp("inicio_at", { mode: 'string' }),
	finAt: timestamp("fin_at", { mode: 'string' }),
},
(table) => [
	index("ix_servcontr_propietario").on(table.propietarioId, table.estado),
	index("ix_servcontr_inmueble").on(table.inmuebleId),
	primaryKey({ columns: [table.id], name: "servicios_contratados_id"}),
]);

export const descuentosVolumen = mysqlTable("descuentos_volumen", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	planId: int("plan_id", { unsigned: true }).references(() => planes.id, { onDelete: "cascade" } ),
	desdeUnidades: smallint("desde_unidades", { unsigned: true }).notNull(),
	hastaUnidades: smallint("hasta_unidades", { unsigned: true }),
	descuentoPct: decimal("descuento_pct", { precision: 5, scale: 2 }).notNull(),
	activo: boolean("activo").default(true).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenteDesde: date("vigente_desde", { mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenteHasta: date("vigente_hasta", { mode: 'string' }),
},
(table) => [
	index("ix_descvol_plan").on(table.planId, table.desdeUnidades),
	primaryKey({ columns: [table.id], name: "descuentos_volumen_id"}),
	check("ck_descvol_pct", sql`((\`descuento_pct\` >= 0) and (\`descuento_pct\` <= 100))`),
]);

export const facturasYalqui = mysqlTable("facturas_yalqui", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	propietarioId: int("propietario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "restrict" } ),
	numero: varchar({ length: 40 }).notNull(),
	periodo: char({ length: 7 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaEmision: date("fecha_emision", { mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaVencimiento: date("fecha_vencimiento", { mode: 'string' }).notNull(),
	subtotal: decimal({ precision: 14, scale: 2 }).notNull(),
	impuestos: decimal({ precision: 14, scale: 2 }).default('0.00').notNull(),
	total: decimal({ precision: 14, scale: 2 }).notNull(),
	saldo: decimal({ precision: 14, scale: 2 }).notNull(),
	moneda: char({ length: 3 }).default('COP').notNull(),
	estado: mysqlEnum(['borrador','emitida','parcial','pagada','vencida','anulada']).default('borrador').notNull(),
	cufe: varchar({ length: 120 }),
	archivoId: bigint("archivo_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_factyalqui_estado").on(table.estado, table.fechaVencimiento),
	primaryKey({ columns: [table.id], name: "facturas_yalqui_id"}),
	unique("uk_factyalqui_numero").on(table.numero),
	unique("uk_factyalqui_periodo").on(table.propietarioId, table.periodo),
]);

export const facturaYalquiConceptos = mysqlTable("factura_yalqui_conceptos", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	facturaYalquiId: int("factura_yalqui_id", { unsigned: true }).notNull().references(() => facturasYalqui.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['suscripcion','servicio','ajuste']).notNull(),
	suscripcionId: int("suscripcion_id", { unsigned: true }).references(() => suscripciones.id, { onDelete: "set null" } ),
	servicioContratadoId: int("servicio_contratado_id", { unsigned: true }).references(() => serviciosContratados.id, { onDelete: "set null" } ),
	inmuebleId: int("inmueble_id", { unsigned: true }).references(() => inmuebles.id, { onDelete: "set null" } ),
	descripcion: varchar({ length: 255 }).notNull(),
	cantidad: smallint({ unsigned: true }).default(1).notNull(),
	precioUnitario: decimal("precio_unitario", { precision: 14, scale: 2 }).notNull(),
	tasaImpuesto: decimal("tasa_impuesto", { precision: 5, scale: 2 }).default('0.00').notNull(),
	total: decimal({ precision: 14, scale: 2 }).notNull(),
},
(table) => [
	index("ix_factyconc_factura").on(table.facturaYalquiId),
	primaryKey({ columns: [table.id], name: "factura_yalqui_conceptos_id"}),
]);

export const pagosYalqui = mysqlTable("pagos_yalqui", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	facturaYalquiId: int("factura_yalqui_id", { unsigned: true }).notNull().references(() => facturasYalqui.id, { onDelete: "restrict" } ),
	propietarioId: int("propietario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "restrict" } ),
	monto: decimal({ precision: 14, scale: 2 }).notNull(),
	metodo: mysqlEnum(['pse','tarjeta','debito_automatico','transferencia']).notNull(),
	pasarela: varchar({ length: 60 }),
	referenciaExterna: varchar("referencia_externa", { length: 120 }),
	estado: mysqlEnum(['iniciado','aprobado','rechazado','reversado']).default('iniciado').notNull(),
	pagadoAt: timestamp("pagado_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_pagoyalqui_factura").on(table.facturaYalquiId),
	primaryKey({ columns: [table.id], name: "pagos_yalqui_id"}),
	unique("uk_pagoyalqui_externo").on(table.pasarela, table.referenciaExterna),
]);

export const contratoAnexos = mysqlTable("contrato_anexos", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	contratoId: int("contrato_id", { unsigned: true }).notNull().references(() => contratos.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['inventario_entrega','otrosi','acta_entrega','paz_y_salvo','requerimiento','poder']).notNull(),
	archivoId: bigint("archivo_id", { mode: "number", unsigned: true }).notNull().references(() => archivos.id, { onDelete: "restrict" } ),
	descripcion: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_anexos_contrato").on(table.contratoId, table.tipo),
	primaryKey({ columns: [table.id], name: "contrato_anexos_id"}),
]);

export const incrementosCanon = mysqlTable("incrementos_canon", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	contratoId: int("contrato_id", { unsigned: true }).notNull().references(() => contratos.id, { onDelete: "cascade" } ),
	anio: smallint({ unsigned: true }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	aplicaDesde: date("aplica_desde", { mode: 'string' }).notNull(),
	indice: mysqlEnum(['ipc','fijo','ninguno']).notNull(),
	indiceValor: decimal("indice_valor", { precision: 5, scale: 2 }),
	canonAnterior: decimal("canon_anterior", { precision: 14, scale: 2 }).notNull(),
	canonNuevo: decimal("canon_nuevo", { precision: 14, scale: 2 }).notNull(),
	estado: mysqlEnum(['programado','notificado','aplicado','omitido','rechazado']).default('programado').notNull(),
	comunicadoId: int("comunicado_id", { unsigned: true }),
	omitidoMotivo: varchar("omitido_motivo", { length: 255 }),
	notificadoAt: timestamp("notificado_at", { mode: 'string' }),
	aplicadoAt: timestamp("aplicado_at", { mode: 'string' }),
},
(table) => [
	index("ix_incremento_cola").on(table.estado, table.aplicaDesde),
	primaryKey({ columns: [table.id], name: "incrementos_canon_id"}),
	unique("uk_incremento").on(table.contratoId, table.anio),
]);

export const terminaciones = mysqlTable("terminaciones", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	contratoId: int("contrato_id", { unsigned: true }).notNull().references(() => contratos.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['vencimiento','mutuo_acuerdo','preaviso_inquilino','incumplimiento','restitucion']).notNull(),
	preavisoRecibidoAt: timestamp("preaviso_recibido_at", { mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaSalidaPactada: date("fecha_salida_pactada", { mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaSalidaReal: date("fecha_salida_real", { mode: 'string' }),
	estado: mysqlEnum(['anunciada','en_curso','entregada','liquidada','cerrada']).default('anunciada').notNull(),
	inspeccionSalidaId: int("inspeccion_salida_id", { unsigned: true }).references(() => inspecciones.id, { onDelete: "set null" } ),
	danosAtribuibles: decimal("danos_atribuibles", { precision: 14, scale: 2 }).default('0.00').notNull(),
	saldoPendiente: decimal("saldo_pendiente", { precision: 14, scale: 2 }).default('0.00').notNull(),
	garantiaADevolver: decimal("garantia_a_devolver", { precision: 14, scale: 2 }).default('0.00').notNull(),
	liquidacionNeta: decimal("liquidacion_neta", { precision: 14, scale: 2 }),
	checklist: json(),
	diasVacia: smallint("dias_vacia", { unsigned: true }),
	actaArchivoId: bigint("acta_archivo_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	cerradaAt: timestamp("cerrada_at", { mode: 'string' }),
},
(table) => [
	index("ix_terminacion_estado").on(table.estado, table.fechaSalidaPactada),
	primaryKey({ columns: [table.id], name: "terminaciones_id"}),
	unique("uk_terminacion_contrato").on(table.contratoId),
]);

export const obligacionesPropietario = mysqlTable("obligaciones_propietario", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	propietarioId: int("propietario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	inmuebleId: int("inmueble_id", { unsigned: true }).references(() => inmuebles.id, { onDelete: "cascade" } ),
	edificacionId: int("edificacion_id", { unsigned: true }).references(() => edificaciones.id, { onDelete: "cascade" } ),
	tipo: mysqlEnum(['impuesto_predial','poliza_arrendamiento','seguro_inmueble','revision_gas','certificado_gasodomesticos','cuota_extraordinaria','otro']).notNull(),
	descripcion: varchar({ length: 255 }),
	montoEstimado: decimal("monto_estimado", { precision: 14, scale: 2 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaVencimiento: date("fecha_vencimiento", { mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fechaDescuento: date("fecha_descuento", { mode: 'string' }),
	periodicidad: mysqlEnum(['unica','anual','quinquenal']).default('anual').notNull(),
	recordarDiasAntes: smallint("recordar_dias_antes", { unsigned: true }).default(30).notNull(),
	estado: mysqlEnum(['pendiente','recordada','cumplida','vencida','omitida']).default('pendiente').notNull(),
	soporteArchivoId: bigint("soporte_archivo_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	cumplidaAt: timestamp("cumplida_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_oblig_calendario").on(table.propietarioId, table.estado, table.fechaVencimiento),
	index("ix_oblig_inmueble").on(table.inmuebleId),
	primaryKey({ columns: [table.id], name: "obligaciones_propietario_id"}),
]);

export const reglasVerificacionPago = mysqlTable("reglas_verificacion_pago", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	propietarioId: int("propietario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	inmuebleId: int("inmueble_id", { unsigned: true }).references(() => inmuebles.id, { onDelete: "cascade" } ),
	nombre: varchar({ length: 120 }).notNull(),
	montoExacto: tinyint("monto_exacto").default(1).notNull(),
	tolerancia: decimal({ precision: 14, scale: 2 }).default('0.00').notNull(),
	diaDesde: tinyint("dia_desde", { unsigned: true }).default(1).notNull(),
	diaHasta: tinyint("dia_hasta", { unsigned: true }).default(31).notNull(),
	canales: json(),
	exigeComprobante: tinyint("exige_comprobante").default(1).notNull(),
	accion: mysqlEnum(['verificar','marcar_probable']).default('marcar_probable').notNull(),
	activa: tinyint().default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_reglaverif_propietario").on(table.propietarioId, table.activa),
	index("ix_reglaverif_inmueble").on(table.inmuebleId),
	primaryKey({ columns: [table.id], name: "reglas_verificacion_pago_id"}),
]);
