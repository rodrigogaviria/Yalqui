-- Qué plantilla usa cada edificación o unidad al generar un contrato, en vez
-- de la vigente del marco legal a secas. La unidad hereda la de su
-- edificación por defecto (ninguna de las dos puesta), pero puede tener la
-- suya propia.
ALTER TABLE edificaciones
  ADD COLUMN plantilla_contrato_id INT UNSIGNED NULL AFTER regimen,
  ADD CONSTRAINT fk_edificaciones_plantilla FOREIGN KEY (plantilla_contrato_id) REFERENCES plantillas_contrato(id) ON DELETE SET NULL;

ALTER TABLE inmuebles
  ADD COLUMN plantilla_contrato_id INT UNSIGNED NULL AFTER edificacion_id,
  ADD CONSTRAINT fk_inmuebles_plantilla FOREIGN KEY (plantilla_contrato_id) REFERENCES plantillas_contrato(id) ON DELETE SET NULL;
