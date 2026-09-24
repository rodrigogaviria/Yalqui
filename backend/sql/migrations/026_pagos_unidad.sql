-- 026 · Pagos registrados directamente sobre la unidad.
--
-- Un pago de arriendo cuelga de una factura y un contrato, pero hay unidades
-- arrendadas desde antes de que exista contrato firmado en Yalqui, y el
-- propietario igual recibe su canon todos los meses. Esta tabla deja
-- registrar el pago —fecha, medio y comprobante— sin exigir ese contrato.
-- El periodo es el mes de la fecha del pago: es lo que pinta de verde el mes
-- en el calendario de Pagos.

CREATE TABLE IF NOT EXISTS pagos_unidad (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id            INT UNSIGNED NOT NULL,
  periodo                CHAR(7) NOT NULL,
  fecha_pago             DATE NOT NULL,
  medio                  ENUM('efectivo','transferencia') NOT NULL,
  comprobante_archivo_id BIGINT UNSIGNED NULL,
  registrado_por_id      INT UNSIGNED NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_pagosunidad_inmueble (inmueble_id, periodo),
  CONSTRAINT fk_pagosunidad_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_pagosunidad_registrador FOREIGN KEY (registrado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
