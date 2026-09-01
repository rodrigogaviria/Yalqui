import {
  mysqlTable, int, bigint, varchar, char, text, json, boolean, smallint,
  timestamp, date, decimal, mysqlEnum, uniqueIndex, index,
} from "drizzle-orm/mysql-core";

/* ── FLUJO A · el canon. Va directo del inquilino al propietario.
      Yalqui no lo recauda: emite, registra y verifica. ───────────────────── */

export const facturasArriendo = mysqlTable("facturas_arriendo", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  contratoId: int("contrato_id", { unsigned: true }).notNull(),
  periodo: char("periodo", { length: 7 }).notNull(),
  fechaEmision: date("fecha_emision").notNull(),
  fechaVencimiento: date("fecha_vencimiento").notNull(),
  subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
  mora: decimal("mora", { precision: 14, scale: 2 }).notNull().default("0.00"),
  total: decimal("total", { precision: 14, scale: 2 }).notNull().default("0.00"),
  /** Redundante frente a la suma de pagos, y a propósito: es sobre esta columna
   *  que corren las alertas de mora. Solo la mueven los pagos verificados. */
  saldo: decimal("saldo", { precision: 14, scale: 2 }).notNull().default("0.00"),
  estado: mysqlEnum("estado", ["borrador", "emitida", "parcial", "pagada", "vencida", "anulada"])
    .notNull().default("borrador"),
  diasMora: smallint("dias_mora", { unsigned: true }).notNull().default(0),
  urlPago: varchar("url_pago", { length: 500 }),
  proveedorLinkPago: varchar("proveedor_link_pago", { length: 60 }),
  referenciaLink: varchar("referencia_link", { length: 120 }),
  linkExpiraAt: timestamp("link_expira_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [
  uniqueIndex("uk_factura_contrato_periodo").on(t.contratoId, t.periodo),
  index("ix_factura_cobranza").on(t.estado, t.fechaVencimiento),
]);

export const facturaArriendoConceptos = mysqlTable("factura_arriendo_conceptos", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  facturaId: int("factura_id", { unsigned: true }).notNull(),
  concepto: mysqlEnum("concepto", ["canon", "ajuste", "administracion", "servicios_publicos",
    "mora", "reparacion", "descuento", "otro"]).notNull(),
  contratoAjusteId: int("contrato_ajuste_id", { unsigned: true }),
  descripcion: varchar("descripcion", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 14, scale: 2 }).notNull(),
}, (t) => [index("ix_concepto_factura").on(t.facturaId)]);

/**
 * No es una transacción: es evidencia con estado. El pago ocurrió por fuera.
 * Solo `verificado` mueve el saldo. Un fallo nunca se vuelve rechazo automático.
 */
export const pagosArriendo = mysqlTable("pagos_arriendo", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  facturaId: int("factura_id", { unsigned: true }).notNull(),
  contratoId: int("contrato_id", { unsigned: true }).notNull(),
  reportadoPorId: int("reportado_por_id", { unsigned: true }),
  monto: decimal("monto", { precision: 14, scale: 2 }).notNull(),
  fechaPagoDeclarada: date("fecha_pago_declarada").notNull(),
  canal: mysqlEnum("canal", ["link_pago", "transferencia", "consignacion", "efectivo", "otro"]).notNull(),
  bancoOrigen: varchar("banco_origen", { length: 80 }),
  referenciaExterna: varchar("referencia_externa", { length: 120 }),
  proveedorLink: varchar("proveedor_link", { length: 60 }),
  comprobanteArchivoId: bigint("comprobante_archivo_id", { mode: "number", unsigned: true }),
  estado: mysqlEnum("estado", ["reportado", "en_verificacion", "verificado", "rechazado", "reversado"])
    .notNull().default("reportado"),
  verificadoComo: mysqlEnum("verificado_como", ["manual", "regla", "conciliacion", "pasarela"]),
  verificadoPorId: int("verificado_por_id", { unsigned: true }),
  verificadoAt: timestamp("verificado_at"),
  motivoRechazo: varchar("motivo_rechazo", { length: 500 }),
  retencionFuente: decimal("retencion_fuente", { precision: 14, scale: 2 }).notNull().default("0.00"),
  netoRecibido: decimal("neto_recibido", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [
  uniqueIndex("uk_pago_referencia").on(t.proveedorLink, t.referenciaExterna),
  index("ix_pago_bandeja").on(t.facturaId, t.estado),
  index("ix_pago_por_verificar").on(t.estado, t.createdAt),
  index("ix_pago_contrato").on(t.contratoId, t.fechaPagoDeclarada),
]);

/* ── FLUJO B · lo que Yalqui cobra. Sin relación con el canon. ───────────── */

export const planes = mysqlTable("planes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  descripcion: varchar("descripcion", { length: 500 }),
  precioMes: decimal("precio_mes", { precision: 14, scale: 2 }).notNull(),
  moneda: char("moneda", { length: 3 }).notNull().default("COP"),
  cicloDefault: mysqlEnum("ciclo_default", ["mensual", "anual"]).notNull().default("mensual"),
  activo: boolean("activo").notNull().default(true),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
  vigenteDesde: date("vigente_desde"),
  vigenteHasta: date("vigente_hasta"),
}, (t) => [uniqueIndex("uk_planes_codigo").on(t.codigo)]);

/** Qué desbloquea cada plan. Se guarda RESUELTO por plan, no como herencia:
 *  preguntar si un plan tiene una función es una consulta, no un recorrido. */
export const planCaracteristicas = mysqlTable("plan_caracteristicas", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  planId: int("plan_id", { unsigned: true }).notNull(),
  caracteristicaCodigo: varchar("caracteristica_codigo", { length: 60 }).notNull(),
  nombre: varchar("nombre", { length: 191 }).notNull(),
  incluida: boolean("incluida").notNull().default(true),
  limite: int("limite", { unsigned: true }),
  nota: varchar("nota", { length: 255 }),
  orden: smallint("orden", { unsigned: true }).notNull().default(0),
}, (t) => [
  uniqueIndex("uk_plancar").on(t.planId, t.caracteristicaCodigo),
  index("ix_plancar_codigo").on(t.caracteristicaCodigo),
]);

/** Una suscripción por unidad: cada una puede estar en un plan distinto. */
export const suscripciones = mysqlTable("suscripciones", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull(),
  propietarioId: int("propietario_id", { unsigned: true }).notNull(),
  planId: int("plan_id", { unsigned: true }).notNull(),
  estado: mysqlEnum("estado", ["prueba", "activa", "morosa", "cancelada", "vencida"])
    .notNull().default("activa"),
  ciclo: mysqlEnum("ciclo", ["mensual", "anual"]).notNull().default("mensual"),
  precioCongelado: decimal("precio_congelado", { precision: 14, scale: 2 }).notNull(),
  fechaInicio: date("fecha_inicio").notNull(),
  fechaFin: date("fecha_fin"),
  proximaFacturacionAt: date("proxima_facturacion_at"),
  renovacionAutomatica: boolean("renovacion_automatica").notNull().default(true),
  canceladaAt: timestamp("cancelada_at"),
  motivoCancelacion: varchar("motivo_cancelacion", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => [
  index("ix_suscripcion_propietario").on(t.propietarioId),
  index("ix_suscripcion_cola").on(t.estado, t.proximaFacturacionAt),
]);

/* ── Registro único de salida ─────────────────────────────────────────────
   En fase 1 solo se registra: no hay envío real porque no hay salida a
   internet. El contenido se guarda renderizado, no como referencia. ─────── */

export const mensajes = mysqlTable("mensajes", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  canal: mysqlEnum("canal", ["whatsapp", "email", "sms", "push", "app"]).notNull(),
  direccion: mysqlEnum("direccion", ["saliente", "entrante"]).notNull().default("saliente"),
  contratoId: int("contrato_id", { unsigned: true }),
  respondeAId: bigint("responde_a_id", { mode: "number", unsigned: true }),
  destinatarioId: int("destinatario_id", { unsigned: true }),
  destinatarioTelefono: varchar("destinatario_telefono", { length: 30 }),
  destinatarioEmail: varchar("destinatario_email", { length: 191 }),
  asunto: varchar("asunto", { length: 255 }),
  contenidoRenderizado: text("contenido_renderizado").notNull(),
  origenTipo: mysqlEnum("origen_tipo", ["comunicado", "cobranza", "incidencia", "contrato",
    "score", "alerta", "verificacion", "manual"]).notNull(),
  origenId: bigint("origen_id", { mode: "number", unsigned: true }),
  contexto: json("contexto"),
  proveedor: varchar("proveedor", { length: 60 }),
  mensajeIdExterno: varchar("mensaje_id_externo", { length: 191 }),
  estado: mysqlEnum("estado", ["encolado", "enviado", "entregado", "leido", "fallido", "rechazado"])
    .notNull().default("encolado"),
  error: varchar("error", { length: 500 }),
  costo: decimal("costo", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  enviadoAt: timestamp("enviado_at"),
  entregadoAt: timestamp("entregado_at"),
  leidoAt: timestamp("leido_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uk_mensaje_externo").on(t.proveedor, t.mensajeIdExterno),
  index("ix_mensaje_bandeja").on(t.contratoId, t.createdAt),
  index("ix_mensaje_origen").on(t.origenTipo, t.origenId),
  index("ix_mensaje_destinatario").on(t.destinatarioId, t.createdAt),
  index("ix_mensaje_canal").on(t.canal, t.estado),
]);
