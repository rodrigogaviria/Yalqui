-- El extracto mensual que el propietario genera para un socio inversionista
-- y comparte por enlace. Es una foto congelada del mes: si los movimientos
-- cambian después, el extracto ya enviado no debe cambiar solo — por eso
-- guarda los totales, no los recalcula al abrirse.
CREATE TABLE extractos_socio (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  propietario_id INT UNSIGNED NOT NULL,
  socio_id INT UNSIGNED NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  token CHAR(64) NOT NULL,
  unidades_totales SMALLINT UNSIGNED NOT NULL,
  unidades_ocupadas SMALLINT UNSIGNED NOT NULL,
  ingresos DECIMAL(14,2) NOT NULL,
  recaudo DECIMAL(14,2) NOT NULL,
  gastos_total DECIMAL(14,2) NOT NULL,
  gastos_por_tipo JSON NOT NULL,
  porcentaje_socio DECIMAL(5,2) NOT NULL,
  utilidad_propiedad DECIMAL(14,2) NOT NULL,
  utilidad_socio DECIMAL(14,2) NOT NULL,
  generado_por_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_extracto (propietario_id, socio_id, periodo),
  UNIQUE KEY uk_extracto_token (token),
  CONSTRAINT fk_extracto_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_extracto_socio FOREIGN KEY (socio_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
