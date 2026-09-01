-- Fase 2 · El dinero que Yalqui sí cobra, y lo que le pasa al contrato con el
-- tiempo. Ninguna tabla de acá referencia una de facturas_arriendo: son dos
-- pilas paralelas a propósito.

CREATE TABLE IF NOT EXISTS servicios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo            ENUM('pricing_engine','legal','screening','negotiate','cobranza',
                         'seguro_arrendamiento','factoraje','promocion') NOT NULL,
  nombre            VARCHAR(120) NOT NULL,
  descripcion       VARCHAR(255) NULL,
  modelo_cobro      ENUM('unico','recurrente','por_uso','porcentaje') NOT NULL,
  precio_base       DECIMAL(14,2) NULL,
  porcentaje        DECIMAL(6,3) NULL,
  moneda            CHAR(3) NOT NULL DEFAULT 'COP',
  requiere_contrato BOOLEAN NOT NULL DEFAULT FALSE,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_servicios_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- inmueble_id es obligatorio: todo servicio se cobra por unidad. «Legal para
-- el propietario» son n filas, una por unidad, y así debe verse en la factura.
CREATE TABLE IF NOT EXISTS servicios_contratados (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propietario_id  INT UNSIGNED NOT NULL,
  servicio_id     INT UNSIGNED NOT NULL,
  inmueble_id     INT UNSIGNED NOT NULL,
  contrato_id     INT UNSIGNED NULL,
  estado          ENUM('solicitado','activo','completado','cancelado') NOT NULL DEFAULT 'solicitado',
  precio_acordado DECIMAL(14,2) NOT NULL,
  parametros      JSON NULL,
  solicitado_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inicio_at       TIMESTAMP NULL,
  fin_at          TIMESTAMP NULL,
  KEY ix_servcontr_propietario (propietario_id, estado),
  KEY ix_servcontr_inmueble (inmueble_id),
  CONSTRAINT fk_servcontr_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_servcontr_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_servcontr_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_servcontr_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Escalones por cantidad de unidades. Sin esto el cliente que más valor obtiene
-- es el que más paga por unidad, y baja la mitad del portafolio a Básico.
CREATE TABLE IF NOT EXISTS descuentos_volumen (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id        INT UNSIGNED NULL,
  desde_unidades SMALLINT UNSIGNED NOT NULL,
  hasta_unidades SMALLINT UNSIGNED NULL,
  descuento_pct  DECIMAL(5,2) NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  vigente_desde  DATE NOT NULL,
  vigente_hasta  DATE NULL,
  KEY ix_descvol_plan (plan_id, desde_unidades),
  CONSTRAINT fk_descvol_plan FOREIGN KEY (plan_id) REFERENCES planes(id) ON DELETE CASCADE,
  CONSTRAINT ck_descvol_pct CHECK (descuento_pct >= 0 AND descuento_pct <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una factura por propietario y periodo, con un concepto por unidad — no una
-- factura por inmueble. A diferencia del arriendo, esta sí va a la DIAN.
CREATE TABLE IF NOT EXISTS facturas_yalqui (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propietario_id INT UNSIGNED NOT NULL,
  numero         VARCHAR(40) NOT NULL,
  periodo        CHAR(7) NOT NULL,
  fecha_emision  DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  subtotal       DECIMAL(14,2) NOT NULL,
  impuestos      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total          DECIMAL(14,2) NOT NULL,
  saldo          DECIMAL(14,2) NOT NULL,
  moneda         CHAR(3) NOT NULL DEFAULT 'COP',
  estado         ENUM('borrador','emitida','parcial','pagada','vencida','anulada') NOT NULL DEFAULT 'borrador',
  cufe           VARCHAR(120) NULL,
  archivo_id     BIGINT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_factyalqui_numero (numero),
  UNIQUE KEY uk_factyalqui_periodo (propietario_id, periodo),
  KEY ix_factyalqui_estado (estado, fecha_vencimiento),
  CONSTRAINT fk_factyalqui_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_factyalqui_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- inmueble_id en el concepto es lo que permite prorratear el costo de Yalqui
-- por unidad sin adivinar, y que el propietario vea la dirección y no un total.
CREATE TABLE IF NOT EXISTS factura_yalqui_conceptos (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_yalqui_id      INT UNSIGNED NOT NULL,
  tipo                   ENUM('suscripcion','servicio','ajuste') NOT NULL,
  suscripcion_id         INT UNSIGNED NULL,
  servicio_contratado_id INT UNSIGNED NULL,
  inmueble_id            INT UNSIGNED NULL,
  descripcion            VARCHAR(255) NOT NULL,
  cantidad               SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  precio_unitario        DECIMAL(14,2) NOT NULL,
  tasa_impuesto          DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  total                  DECIMAL(14,2) NOT NULL,
  KEY ix_factyconc_factura (factura_yalqui_id),
  CONSTRAINT fk_factyconc_factura FOREIGN KEY (factura_yalqui_id) REFERENCES facturas_yalqui(id) ON DELETE CASCADE,
  CONSTRAINT fk_factyconc_suscripcion FOREIGN KEY (suscripcion_id) REFERENCES suscripciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_factyconc_servicio FOREIGN KEY (servicio_contratado_id) REFERENCES servicios_contratados(id) ON DELETE SET NULL,
  CONSTRAINT fk_factyconc_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS pagos_yalqui (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_yalqui_id INT UNSIGNED NOT NULL,
  propietario_id    INT UNSIGNED NOT NULL,
  monto             DECIMAL(14,2) NOT NULL,
  metodo            ENUM('pse','tarjeta','debito_automatico','transferencia') NOT NULL,
  pasarela          VARCHAR(60) NULL,
  referencia_externa VARCHAR(120) NULL,
  estado            ENUM('iniciado','aprobado','rechazado','reversado') NOT NULL DEFAULT 'iniciado',
  pagado_at         TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pagoyalqui_externo (pasarela, referencia_externa),
  KEY ix_pagoyalqui_factura (factura_yalqui_id),
  CONSTRAINT fk_pagoyalqui_factura FOREIGN KEY (factura_yalqui_id) REFERENCES facturas_yalqui(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pagoyalqui_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS contrato_anexos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contrato_id INT UNSIGNED NOT NULL,
  tipo        ENUM('inventario_entrega','otrosi','acta_entrega','paz_y_salvo','requerimiento','poder') NOT NULL,
  archivo_id  BIGINT UNSIGNED NOT NULL,
  descripcion VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_anexos_contrato (contrato_id, tipo),
  CONSTRAINT fk_anexos_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE,
  CONSTRAINT fk_anexos_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El dato ya estaba en contratos; lo que faltaba era el proceso. La
-- notificación con constancia es lo que hace defendible el aumento.
CREATE TABLE IF NOT EXISTS incrementos_canon (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contrato_id    INT UNSIGNED NOT NULL,
  anio           SMALLINT UNSIGNED NOT NULL,
  aplica_desde   DATE NOT NULL,
  indice         ENUM('ipc','fijo','ninguno') NOT NULL,
  indice_valor   DECIMAL(5,2) NULL,
  canon_anterior DECIMAL(14,2) NOT NULL,
  canon_nuevo    DECIMAL(14,2) NOT NULL,
  estado         ENUM('programado','notificado','aplicado','omitido','rechazado') NOT NULL DEFAULT 'programado',
  comunicado_id  INT UNSIGNED NULL,
  omitido_motivo VARCHAR(255) NULL,
  notificado_at  TIMESTAMP NULL,
  aplicado_at    TIMESTAMP NULL,
  UNIQUE KEY uk_incremento (contrato_id, anio),
  KEY ix_incremento_cola (estado, aplica_desde),
  CONSTRAINT fk_incremento_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- dias_vacia es la métrica que de verdad mide si el sistema sirve, y hasta
-- ahora no se calculaba en ninguna parte. Se llena al firmar el siguiente.
CREATE TABLE IF NOT EXISTS terminaciones (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contrato_id          INT UNSIGNED NOT NULL,
  tipo                 ENUM('vencimiento','mutuo_acuerdo','preaviso_inquilino','incumplimiento','restitucion') NOT NULL,
  preaviso_recibido_at TIMESTAMP NULL,
  fecha_salida_pactada DATE NULL,
  fecha_salida_real    DATE NULL,
  estado               ENUM('anunciada','en_curso','entregada','liquidada','cerrada') NOT NULL DEFAULT 'anunciada',
  inspeccion_salida_id INT UNSIGNED NULL,
  danos_atribuibles    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  saldo_pendiente      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  garantia_a_devolver  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  liquidacion_neta     DECIMAL(14,2) NULL,
  checklist            JSON NULL,
  dias_vacia           SMALLINT UNSIGNED NULL,
  acta_archivo_id      BIGINT UNSIGNED NULL,
  cerrada_at           TIMESTAMP NULL,
  UNIQUE KEY uk_terminacion_contrato (contrato_id),
  KEY ix_terminacion_estado (estado, fecha_salida_pactada),
  CONSTRAINT fk_terminacion_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE,
  CONSTRAINT fk_terminacion_inspeccion FOREIGN KEY (inspeccion_salida_id) REFERENCES inspecciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_terminacion_acta FOREIGN KEY (acta_archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La otra mitad del calendario: lo que el propietario debe, no lo que le deben.
-- fecha_descuento no es adorno — perder el pronto pago del predial es plata.
CREATE TABLE IF NOT EXISTS obligaciones_propietario (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propietario_id     INT UNSIGNED NOT NULL,
  inmueble_id        INT UNSIGNED NULL,
  edificacion_id     INT UNSIGNED NULL,
  tipo               ENUM('impuesto_predial','poliza_arrendamiento','seguro_inmueble','revision_gas',
                          'certificado_gasodomesticos','cuota_extraordinaria','otro') NOT NULL,
  descripcion        VARCHAR(255) NULL,
  monto_estimado     DECIMAL(14,2) NULL,
  fecha_vencimiento  DATE NOT NULL,
  fecha_descuento    DATE NULL,
  periodicidad       ENUM('unica','anual','quinquenal') NOT NULL DEFAULT 'anual',
  recordar_dias_antes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  estado             ENUM('pendiente','recordada','cumplida','vencida','omitida') NOT NULL DEFAULT 'pendiente',
  soporte_archivo_id BIGINT UNSIGNED NULL,
  cumplida_at        TIMESTAMP NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_oblig_calendario (propietario_id, estado, fecha_vencimiento),
  KEY ix_oblig_inmueble (inmueble_id),
  CONSTRAINT fk_oblig_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_oblig_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_oblig_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_oblig_soporte FOREIGN KEY (soporte_archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- «Si el monto coincide exacto y llegó entre el 1 y el 7, verificá solo.»
-- Es el único lugar donde el saldo se mueve sin que un humano mire, y por eso
-- cada pago guarda con qué regla se aprobó.
CREATE TABLE IF NOT EXISTS reglas_verificacion_pago (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propietario_id    INT UNSIGNED NOT NULL,
  inmueble_id       INT UNSIGNED NULL,
  nombre            VARCHAR(120) NOT NULL,
  monto_exacto      BOOLEAN NOT NULL DEFAULT TRUE,
  tolerancia        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  dia_desde         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  dia_hasta         TINYINT UNSIGNED NOT NULL DEFAULT 31,
  canales           JSON NULL,
  exige_comprobante BOOLEAN NOT NULL DEFAULT TRUE,
  accion            ENUM('verificar','marcar_probable') NOT NULL DEFAULT 'marcar_probable',
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_reglaverif_propietario (propietario_id, activa),
  KEY ix_reglaverif_inmueble (inmueble_id),
  CONSTRAINT fk_reglaverif_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_reglaverif_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
