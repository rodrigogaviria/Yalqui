-- 029 · Facturas de la propiedad: agua, energía, gas, predial, seguro...
--
-- Lo que la propiedad genera y alguien tiene que pagar. `tipos_factura` es el
-- catálogo que administra Yalqui (nombre, categoría y cada cuánto llega:
-- mensual, bimensual o anual); `facturas_propiedad` es lo que el propietario
-- registra de cada una. El período de consumo se guarda como texto según la
-- periodicidad del tipo: «2026-09» (mensual), «2026-B3» (bimestre 3) o «2026»
-- (anual).
--
-- No tiene nada que ver con `facturas_yalqui` (lo que Yalqui le cobra al
-- propietario) ni con `facturas_arriendo` (el canon).

CREATE TABLE IF NOT EXISTS tipos_factura (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo       VARCHAR(40) NOT NULL,
  nombre       VARCHAR(120) NOT NULL,
  categoria    VARCHAR(40) NOT NULL,
  periodicidad ENUM('mensual','bimensual','anual') NOT NULL DEFAULT 'mensual',
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  orden        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_tipofactura_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO tipos_factura (codigo, nombre, categoria, periodicidad, orden) VALUES
  ('agua',           'Agua',                      'servicios_publicos',  'mensual', 1),
  ('energia',        'Energía',                   'servicios_publicos',  'mensual', 2),
  ('gas',            'Gas',                       'servicios_publicos',  'mensual', 3),
  ('internet',       'Internet',                  'telecomunicaciones',  'mensual', 4),
  ('administracion', 'Administración',            'administracion',      'mensual', 5),
  ('predial',        'Impuesto predial',          'impuestos',           'anual',   6),
  ('seguro',         'Seguro',                    'seguros',             'anual',   7);

CREATE TABLE IF NOT EXISTS facturas_propiedad (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id        INT UNSIGNED NOT NULL,
  tipo_factura_id    INT UNSIGNED NOT NULL,
  periodo            VARCHAR(10) NOT NULL,
  fecha_vencimiento  DATE NOT NULL,
  valor              DECIMAL(14,2) NOT NULL,
  estado             ENUM('sin_pagar','pagado') NOT NULL DEFAULT 'sin_pagar',
  responsable        ENUM('propietario','inquilino') NOT NULL DEFAULT 'propietario',
  archivo_id         BIGINT UNSIGNED NULL,
  -- El pago, cuando se registra: nace `sin_pagar` y pasa a `pagado` al registrarlo.
  fecha_pago         DATE NULL,
  valor_pagado       DECIMAL(14,2) NULL,
  comprobante_archivo_id BIGINT UNSIGNED NULL,
  registrada_por_id  INT UNSIGNED NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_factprop_inmueble (inmueble_id, fecha_vencimiento),
  KEY ix_factprop_estado (estado, fecha_vencimiento),
  CONSTRAINT fk_factprop_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_factprop_tipo FOREIGN KEY (tipo_factura_id) REFERENCES tipos_factura(id) ON DELETE RESTRICT,
  CONSTRAINT fk_factprop_registrador FOREIGN KEY (registrada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
