-- El pago que el propietario le hace a un socio inversionista por su
-- utilidad. Puede llegar dividido en varios medios —parte en efectivo,
-- parte por transferencia—, por eso vive en una tabla aparte, igual que
-- las partes de un pago de unidad.
CREATE TABLE pagos_socio (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  propietario_id INT UNSIGNED NOT NULL,
  socio_id INT UNSIGNED NOT NULL,
  edificacion_id INT UNSIGNED,
  periodo VARCHAR(7),
  fecha_pago DATE NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  registrado_por_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pagosocio_socio (propietario_id, socio_id),
  CONSTRAINT fk_pagosocio_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_pagosocio_socio FOREIGN KEY (socio_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE pagos_socio_medios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pago_socio_id INT UNSIGNED NOT NULL,
  medio ENUM('efectivo','transferencia','cheque','otro') NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  comprobante_archivo_id BIGINT UNSIGNED,
  PRIMARY KEY (id),
  KEY ix_pagosociomedio_pago (pago_socio_id),
  CONSTRAINT fk_pagosociomedio_pago FOREIGN KEY (pago_socio_id) REFERENCES pagos_socio(id) ON DELETE CASCADE
);
