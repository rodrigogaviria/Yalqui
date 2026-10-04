-- Una memoria puede ser de una unidad o de la edificación entera (el plano
-- arquitectónico del edificio, la licencia de construcción): la unidad no
-- tiene por qué repetir lo que ya es de toda la edificación.
ALTER TABLE inmueble_memorias
  MODIFY COLUMN inmueble_id INT UNSIGNED NULL,
  ADD COLUMN edificacion_id INT UNSIGNED NULL AFTER inmueble_id,
  ADD CONSTRAINT fk_memorias_edificacion FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  ADD CONSTRAINT ck_memorias_sitio CHECK (
    (inmueble_id IS NOT NULL AND edificacion_id IS NULL) OR (inmueble_id IS NULL AND edificacion_id IS NOT NULL)
  ),
  ADD INDEX ix_memorias_edificacion_tipo (edificacion_id, tipo);
