// Rentabilidad en dos niveles, conciliación bancaria y expediente de mora.
// Generado por introspección de la base ya migrada. Las migraciones siguen
// siendo los .sql versionados: esto es el tipo, no la fuente de verdad.
import {
  mysqlTable, int, bigint, varchar, char, json, smallint, timestamp, date, decimal, mysqlEnum, unique, index, primaryKey, foreignKey, check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

import { contratos } from "./contrato.js";
import { pagosArriendo } from "./dinero.js";
import { archivos, usuarios } from "./identidad.js";
import { edificaciones, inmuebles } from "./inventario.js";

export const movimientos = mysqlTable("movimientos", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	ambito: mysqlEnum(['unidad','edificacion']).notNull(),
	inmuebleId: int("inmueble_id", { unsigned: true }).references(() => inmuebles.id, { onDelete: "cascade" } ),
	edificacionId: int("edificacion_id", { unsigned: true }).references(() => edificaciones.id, { onDelete: "cascade" } ),
	contratoId: int("contrato_id", { unsigned: true }).references(() => contratos.id, { onDelete: "set null" } ),
	movimientoPadreId: bigint("movimiento_padre_id", { mode: "number", unsigned: true }),
	tipo: mysqlEnum(['ingreso','egreso']).notNull(),
	categoria: mysqlEnum(['canon','administracion','mantenimiento','fachada','zonas_comunes','impuesto_predial','seguro','suscripcion_yalqui','servicio_yalqui','otro']).notNull(),
	monto: decimal({ precision: 14, scale: 2 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fecha: date({ mode: 'string' }).notNull(),
	prorrateo: mysqlEnum(['ninguno','partes_iguales','por_area','por_canon']).default('ninguno').notNull(),
	origenTipo: mysqlEnum("origen_tipo", ['pago_arriendo','incidencia','factura_yalqui','obligacion','manual']).notNull(),
	origenId: bigint("origen_id", { mode: "number", unsigned: true }),
	nota: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_mov_inmueble").on(table.inmuebleId, table.fecha),
	index("ix_mov_edificacion").on(table.edificacionId, table.fecha),
	index("ix_mov_padre").on(table.movimientoPadreId),
	index("ix_mov_origen").on(table.origenTipo, table.origenId),
	foreignKey({
			columns: [table.movimientoPadreId],
			foreignColumns: [table.id],
			name: "fk_mov_padre"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.id], name: "movimientos_id"}),
	check("ck_mov_ambito", sql`(((\`ambito\` = _utf8mb4\'unidad\') and (\`inmueble_id\` is not null)) or ((\`ambito\` = _utf8mb4\'edificacion\') and (\`edificacion_id\` is not null)))`),
]);

export const movimientosBancarios = mysqlTable("movimientos_bancarios", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	propietarioId: int("propietario_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "cascade" } ),
	banco: varchar({ length: 80 }).notNull(),
	cuentaEnmascarada: varchar("cuenta_enmascarada", { length: 30 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fecha: date({ mode: 'string' }).notNull(),
	valor: decimal({ precision: 14, scale: 2 }).notNull(),
	tipo: mysqlEnum(['credito','debito']).notNull(),
	referencia: varchar({ length: 120 }),
	descripcion: varchar({ length: 255 }),
	origen: mysqlEnum(['extracto','api_bancaria','manual']).default('extracto').notNull(),
	archivoOrigenId: bigint("archivo_origen_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	estado: mysqlEnum(['sin_conciliar','conciliado','ignorado']).default('sin_conciliar').notNull(),
	pagoArriendoId: int("pago_arriendo_id", { unsigned: true }).references(() => pagosArriendo.id, { onDelete: "set null" } ),
	confianza: decimal({ precision: 4, scale: 3 }),
	conciliadoAt: timestamp("conciliado_at", { mode: 'string' }),
},
(table) => [
	index("ix_movbanc_estado").on(table.propietarioId, table.estado, table.fecha),
	primaryKey({ columns: [table.id], name: "movimientos_bancarios_id"}),
	unique("uk_movbanc").on(table.propietarioId, table.banco, table.fecha, table.valor, table.referencia),
]);

export const expedientesMora = mysqlTable("expedientes_mora", {
	id: int({ unsigned: true }).autoincrement().notNull(),
	contratoId: int("contrato_id", { unsigned: true }).notNull().references(() => contratos.id, { onDelete: "cascade" } ),
	generadoPorId: int("generado_por_id", { unsigned: true }).notNull().references(() => usuarios.id, { onDelete: "restrict" } ),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodoDesde: date("periodo_desde", { mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodoHasta: date("periodo_hasta", { mode: 'string' }).notNull(),
	mesesEnMora: smallint("meses_en_mora", { unsigned: true }).notNull(),
	totalAdeudado: decimal("total_adeudado", { precision: 14, scale: 2 }).notNull(),
	numRequerimientos: smallint("num_requerimientos", { unsigned: true }).notNull(),
	incluye: json(),
	archivoId: bigint("archivo_id", { mode: "number", unsigned: true }).references(() => archivos.id, { onDelete: "set null" } ),
	hashDocumento: char("hash_documento", { length: 64 }),
	generadoAt: timestamp("generado_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ix_expmora_contrato").on(table.contratoId, table.generadoAt),
	primaryKey({ columns: [table.id], name: "expedientes_mora_id"}),
]);
