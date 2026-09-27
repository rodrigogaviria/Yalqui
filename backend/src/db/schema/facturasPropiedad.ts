// Las facturas que genera la propiedad —agua, energía, predial— y el catálogo
// que las clasifica. Nada que ver con las facturas de Yalqui ni con el canon.
import {
  mysqlTable, int, bigint, varchar, date, timestamp, smallint, boolean, decimal, mysqlEnum, index, uniqueIndex,
} from "drizzle-orm/mysql-core";

import { inmuebles, edificaciones } from "./inventario.js";
import { usuarios } from "./identidad.js";

export const PERIODICIDADES_FACTURA = ["mensual", "bimensual", "anual"] as const;

export const tiposFactura = mysqlTable("tipos_factura", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  categoria: varchar("categoria", { length: 40 }).notNull(),
  periodicidad: mysqlEnum("periodicidad", PERIODICIDADES_FACTURA).notNull().default("mensual"),
  /** Agua, energía y gas son de un medidor: sin su número no se sabe de cuál. */
  requiereMedidor: boolean("requiere_medidor").notNull().default(false),
  /** Internet se paga con una referencia que hay que digitar. */
  requiereReferencia: boolean("requiere_referencia").notNull().default(false),
  /** El concepto de gasto que genera su pago. Sin él, «Otro egreso». */
  tipoMovimientoId: int("tipo_movimiento_id", { unsigned: true }),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_tipofactura_codigo").on(t.codigo)]);

export const facturasPropiedad = mysqlTable("facturas_propiedad", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  /** De la unidad o de la edificación: exactamente una de las dos. */
  inmuebleId: int("inmueble_id", { unsigned: true })
    .references(() => inmuebles.id, { onDelete: "cascade" }),
  edificacionId: int("edificacion_id", { unsigned: true })
    .references(() => edificaciones.id, { onDelete: "cascade" }),
  tipoFacturaId: int("tipo_factura_id", { unsigned: true }).notNull()
    .references(() => tiposFactura.id, { onDelete: "restrict" }),
  /** «2026-09», «2026-B3» o «2026», según la periodicidad del tipo. */
  periodo: varchar("periodo", { length: 10 }).notNull(),
  fechaVencimiento: date("fecha_vencimiento").notNull(),
  valor: decimal("valor", { precision: 14, scale: 2 }).notNull(),
  estado: mysqlEnum("estado", ["sin_pagar", "pagado", "anulada"]).notNull().default("sin_pagar"),
  responsable: mysqlEnum("responsable", ["propietario", "inquilino"]).notNull().default("propietario"),
  /** Cómo se reparte entre las unidades una factura de toda la edificación. */
  prorrateo: mysqlEnum("prorrateo", ["ninguno", "partes_iguales", "por_area", "por_canon"]).notNull().default("ninguno"),
  numeroMedidor: varchar("numero_medidor", { length: 40 }),
  referenciaPago: varchar("referencia_pago", { length: 60 }),
  archivoId: bigint("archivo_id", { mode: "number", unsigned: true }),
  fechaPago: date("fecha_pago"),
  valorPagado: decimal("valor_pagado", { precision: 14, scale: 2 }),
  comprobanteArchivoId: bigint("comprobante_archivo_id", { mode: "number", unsigned: true }),
  motivoAnulacion: varchar("motivo_anulacion", { length: 500 }),
  anuladaAt: timestamp("anulada_at"),
  anuladaPorId: int("anulada_por_id", { unsigned: true })
    .references(() => usuarios.id, { onDelete: "set null" }),
  registradaPorId: int("registrada_por_id", { unsigned: true })
    .references(() => usuarios.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_factprop_inmueble").on(t.inmuebleId, t.fechaVencimiento),
  index("ix_factprop_edificacion").on(t.edificacionId, t.fechaVencimiento),
  index("ix_factprop_estado").on(t.estado, t.fechaVencimiento),
]);
