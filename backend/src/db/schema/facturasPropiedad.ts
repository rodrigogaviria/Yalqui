// Las facturas que genera la propiedad —agua, energía, predial— y el catálogo
// que las clasifica. Nada que ver con las facturas de Yalqui ni con el canon.
import {
  mysqlTable, int, bigint, varchar, date, timestamp, smallint, boolean, decimal, mysqlEnum, index, uniqueIndex,
} from "drizzle-orm/mysql-core";

import { inmuebles } from "./inventario.js";
import { usuarios } from "./identidad.js";

export const PERIODICIDADES_FACTURA = ["mensual", "bimensual", "anual"] as const;

export const tiposFactura = mysqlTable("tipos_factura", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  categoria: varchar("categoria", { length: 40 }).notNull(),
  periodicidad: mysqlEnum("periodicidad", PERIODICIDADES_FACTURA).notNull().default("mensual"),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [uniqueIndex("uk_tipofactura_codigo").on(t.codigo)]);

export const facturasPropiedad = mysqlTable("facturas_propiedad", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull()
    .references(() => inmuebles.id, { onDelete: "cascade" }),
  tipoFacturaId: int("tipo_factura_id", { unsigned: true }).notNull()
    .references(() => tiposFactura.id, { onDelete: "restrict" }),
  /** «2026-09», «2026-B3» o «2026», según la periodicidad del tipo. */
  periodo: varchar("periodo", { length: 10 }).notNull(),
  fechaVencimiento: date("fecha_vencimiento").notNull(),
  valor: decimal("valor", { precision: 14, scale: 2 }).notNull(),
  estado: mysqlEnum("estado", ["sin_pagar", "pagado"]).notNull().default("sin_pagar"),
  responsable: mysqlEnum("responsable", ["propietario", "inquilino"]).notNull().default("propietario"),
  archivoId: bigint("archivo_id", { mode: "number", unsigned: true }),
  fechaPago: date("fecha_pago"),
  valorPagado: decimal("valor_pagado", { precision: 14, scale: 2 }),
  comprobanteArchivoId: bigint("comprobante_archivo_id", { mode: "number", unsigned: true }),
  registradaPorId: int("registrada_por_id", { unsigned: true })
    .references(() => usuarios.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_factprop_inmueble").on(t.inmuebleId, t.fechaVencimiento),
  index("ix_factprop_estado").on(t.estado, t.fechaVencimiento),
]);
