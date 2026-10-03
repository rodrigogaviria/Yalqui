-- Los documentos técnicos y legales de cada unidad: planos, fichas técnicas,
-- licencias, documentos contables. Van aparte de las fotos (inmueble_fotos):
-- no son una galería, son un archivo por tipo, y puede haber varios del
-- mismo tipo (más de un plano eléctrico, por ejemplo).
CREATE TABLE inmueble_memorias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inmueble_id INT UNSIGNED NOT NULL,
  archivo_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM(
    'descripcion_visual', 'documentos_contables', 'fichas_tecnicas', 'licencias', 'otros',
    'planos_arquitectonicos', 'planos_electricos', 'planos_estructurales', 'planos_hidraulicos'
  ) NOT NULL,
  descripcion VARCHAR(255) NULL,
  subida_por_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_memorias_inmueble_tipo (inmueble_id, tipo),
  CONSTRAINT fk_memorias_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_memorias_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_memorias_usuario FOREIGN KEY (subida_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
