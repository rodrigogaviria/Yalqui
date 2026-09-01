-- 004 · Los dos flujos de dinero, separados por diseño, más el registro de salida.
--
-- FLUJO A · el canon va DIRECTO del inquilino al propietario. Yalqui no lo
--           recauda ni lo custodia: emite la factura, guarda el comprobante y
--           lleva el ciclo de verificación. Ninguna tabla de acá referencia una
--           de las de Yalqui, ni al revés.
-- FLUJO B · lo que Yalqui sí cobra: la suscripción por unidad.

-- ---------- FLUJO A · arriendo ----------

CREATE TABLE IF NOT EXISTS facturas_arriendo (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contrato_id        INT UNSIGNED NOT NULL,
  periodo            CHAR(7) NOT NULL,
  fecha_emision      DATE NOT NULL,
  fecha_vencimiento  DATE NOT NULL,
  subtotal           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  mora               DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total              DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  saldo              DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  estado             ENUM('borrador','emitida','parcial','pagada','vencida','anulada')
                     NOT NULL DEFAULT 'borrador',
  dias_mora          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  url_pago           VARCHAR(500) NULL,
  proveedor_link_pago VARCHAR(60) NULL,
  referencia_link    VARCHAR(120) NULL,
  link_expira_at     TIMESTAMP NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_factura_contrato_periodo (contrato_id, periodo),
  KEY ix_factura_cobranza (estado, fecha_vencimiento),
  CONSTRAINT fk_factura_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE RESTRICT,
  CONSTRAINT ck_factura_montos CHECK (total >= 0 AND saldo >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Los descuentos van con valor negativo; no hay tabla aparte para ellos.
-- Un concepto de tipo `ajuste` apunta al contrato_ajuste que lo originó: por eso
-- el inquilino puede tocar «Parqueadero» en su factura y ver de dónde sale.
CREATE TABLE IF NOT EXISTS factura_arriendo_conceptos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_id         INT UNSIGNED NOT NULL,
  concepto           ENUM('canon','ajuste','administracion','servicios_publicos',
                          'mora','reparacion','descuento','otro') NOT NULL,
  contrato_ajuste_id INT UNSIGNED NULL,
  descripcion        VARCHAR(255) NOT NULL,
  valor              DECIMAL(14,2) NOT NULL,
  KEY ix_concepto_factura (factura_id),
  CONSTRAINT fk_concepto_factura FOREIGN KEY (factura_id) REFERENCES facturas_arriendo(id) ON DELETE CASCADE,
  CONSTRAINT fk_concepto_ajuste FOREIGN KEY (contrato_ajuste_id) REFERENCES contrato_ajustes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- NO es una transacción: es EVIDENCIA con estado. El pago ocurrió por fuera de
-- Yalqui. Solo `verificado` mueve el saldo de la factura y detiene la cobranza.
-- Un fallo o una duda nunca se convierten en rechazo automático.
CREATE TABLE IF NOT EXISTS pagos_arriendo (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_id            INT UNSIGNED NOT NULL,
  contrato_id           INT UNSIGNED NOT NULL,
  reportado_por_id      INT UNSIGNED NULL,
  monto                 DECIMAL(14,2) NOT NULL,
  fecha_pago_declarada  DATE NOT NULL,
  canal                 ENUM('link_pago','transferencia','consignacion','efectivo','otro') NOT NULL,
  banco_origen          VARCHAR(80) NULL,
  referencia_externa    VARCHAR(120) NULL,
  proveedor_link        VARCHAR(60) NULL,
  comprobante_archivo_id BIGINT UNSIGNED NULL,
  estado                ENUM('reportado','en_verificacion','verificado','rechazado','reversado')
                        NOT NULL DEFAULT 'reportado',
  verificado_como       ENUM('manual','regla','conciliacion','pasarela') NULL,
  verificado_por_id     INT UNSIGNED NULL,
  verificado_at         TIMESTAMP NULL,
  motivo_rechazo        VARCHAR(500) NULL,
  retencion_fuente      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  neto_recibido         DECIMAL(14,2) NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Idempotencia: el mismo pago de la misma pasarela no entra dos veces.
  UNIQUE KEY uk_pago_referencia (proveedor_link, referencia_externa),
  KEY ix_pago_bandeja (factura_id, estado),
  KEY ix_pago_por_verificar (estado, created_at),
  KEY ix_pago_contrato (contrato_id, fecha_pago_declarada),
  CONSTRAINT fk_pago_factura FOREIGN KEY (factura_id) REFERENCES facturas_arriendo(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pago_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pago_reportante FOREIGN KEY (reportado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_pago_verificador FOREIGN KEY (verificado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_pago_comprobante FOREIGN KEY (comprobante_archivo_id) REFERENCES archivos(id) ON DELETE SET NULL,
  CONSTRAINT ck_pago_monto CHECK (monto > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- FLUJO B · lo que Yalqui cobra ----------

-- Catálogo con seeders: repreciar o renombrar es un UPDATE, no una migración.
-- Los precios viejos no se editan: se cierran con vigente_hasta.
CREATE TABLE IF NOT EXISTS planes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(40) NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  descripcion   VARCHAR(500) NULL,
  precio_mes    DECIMAL(14,2) NOT NULL,
  moneda        CHAR(3) NOT NULL DEFAULT 'COP',
  ciclo_default ENUM('mensual','anual') NOT NULL DEFAULT 'mensual',
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  vigente_desde DATE NULL,
  vigente_hasta DATE NULL,
  UNIQUE KEY uk_planes_codigo (codigo),
  CONSTRAINT ck_planes_precio CHECK (precio_mes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una suscripción por UNIDAD, no por propietario: cada unidad puede estar en un
-- plan distinto. Se lleva propietario_id además de inmueble_id aunque sea
-- derivable, porque es la columna sobre la que se agrupa la factura mensual.
CREATE TABLE IF NOT EXISTS suscripciones (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id          INT UNSIGNED NOT NULL,
  propietario_id       INT UNSIGNED NOT NULL,
  plan_id              INT UNSIGNED NOT NULL,
  estado               ENUM('prueba','activa','morosa','cancelada','vencida') NOT NULL DEFAULT 'activa',
  ciclo                ENUM('mensual','anual') NOT NULL DEFAULT 'mensual',
  precio_congelado     DECIMAL(14,2) NOT NULL,
  fecha_inicio         DATE NOT NULL,
  fecha_fin            DATE NULL,
  proxima_facturacion_at DATE NULL,
  renovacion_automatica BOOLEAN NOT NULL DEFAULT TRUE,
  cancelada_at         TIMESTAMP NULL,
  motivo_cancelacion   VARCHAR(500) NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Una sola suscripción viva por unidad. MySQL no tiene únicos parciales.
  viva_uk              INT UNSIGNED AS (IF(estado IN ('prueba','activa','morosa'), inmueble_id, NULL)) VIRTUAL,
  UNIQUE KEY uk_suscripcion_viva (viva_uk),
  KEY ix_suscripcion_propietario (propietario_id),
  KEY ix_suscripcion_cola (estado, proxima_facturacion_at),
  CONSTRAINT fk_suscripcion_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_suscripcion_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_suscripcion_plan FOREIGN KEY (plan_id) REFERENCES planes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Registro único de salida ----------

-- Todo lo que Yalqui manda, por el canal que sea. En fase 1 solo se registra:
-- no hay envío real porque no hay salida a internet. El contenido se guarda
-- RENDERIZADO, no como referencia: si la plantilla cambia, el mensaje enviado
-- sigue diciendo lo que decía.
CREATE TABLE IF NOT EXISTS mensajes (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  canal              ENUM('whatsapp','email','sms','push','app') NOT NULL,
  direccion          ENUM('saliente','entrante') NOT NULL DEFAULT 'saliente',
  contrato_id        INT UNSIGNED NULL,
  responde_a_id      BIGINT UNSIGNED NULL,
  destinatario_id    INT UNSIGNED NULL,
  destinatario_telefono VARCHAR(30) NULL,
  destinatario_email VARCHAR(191) NULL,
  asunto             VARCHAR(255) NULL,
  contenido_renderizado TEXT NOT NULL,
  origen_tipo        ENUM('comunicado','cobranza','incidencia','contrato','score',
                          'alerta','verificacion','manual') NOT NULL,
  origen_id          BIGINT UNSIGNED NULL,
  contexto           JSON NULL,
  proveedor          VARCHAR(60) NULL,
  mensaje_id_externo VARCHAR(191) NULL,
  estado             ENUM('encolado','enviado','entregado','leido','fallido','rechazado')
                     NOT NULL DEFAULT 'encolado',
  error              VARCHAR(500) NULL,
  costo              DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  enviado_at         TIMESTAMP NULL,
  entregado_at       TIMESTAMP NULL,
  leido_at           TIMESTAMP NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Los webhooks de estado llegan varias veces: idempotencia por id externo.
  UNIQUE KEY uk_mensaje_externo (proveedor, mensaje_id_externo),
  KEY ix_mensaje_bandeja (contrato_id, created_at),
  KEY ix_mensaje_origen (origen_tipo, origen_id),
  KEY ix_mensaje_destinatario (destinatario_id, created_at),
  KEY ix_mensaje_canal (canal, estado),
  CONSTRAINT fk_mensaje_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL,
  CONSTRAINT fk_mensaje_responde FOREIGN KEY (responde_a_id) REFERENCES mensajes(id) ON DELETE SET NULL,
  CONSTRAINT fk_mensaje_destinatario FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
