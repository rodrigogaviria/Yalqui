-- La constancia de que el inquilino recibió la unidad, con evidencia
-- (fotos/videos, en la tabla genérica `archivos`) y firma de ambas partes.
CREATE TABLE actas_entrega (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contrato_id INT UNSIGNED NOT NULL,
  texto TEXT NOT NULL,
  entrega_firmada_at TIMESTAMP NULL,
  inquilino_firmada_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_actas_contrato (contrato_id),
  CONSTRAINT fk_actas_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
);
