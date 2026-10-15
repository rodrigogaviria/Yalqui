-- El «vecino embajador»: el propietario activa y configura, unidad por
-- unidad, el % que paga a quien se la promocione y logre que se arriende.
ALTER TABLE inmuebles
  ADD COLUMN comision_promotor_pct DECIMAL(5,2) NULL AFTER frecuencia_pago_flexible;

CREATE TABLE promociones_unidad (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  inmueble_id INT UNSIGNED NOT NULL,
  promotor_id INT UNSIGNED NOT NULL,
  estado ENUM('pendiente', 'aprobada', 'rechazada') NOT NULL DEFAULT 'pendiente',
  creada_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decidida_at TIMESTAMP NULL,
  decidida_por_id INT UNSIGNED NULL,
  contrato_id INT UNSIGNED NULL,
  comision_monto DECIMAL(14,2) NULL,
  comision_estado ENUM('pendiente', 'pagada') NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_promocion_unidad_promotor (inmueble_id, promotor_id),
  KEY ix_promocion_promotor (promotor_id, estado),
  CONSTRAINT fk_promo_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_promo_promotor FOREIGN KEY (promotor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_promo_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL
);
