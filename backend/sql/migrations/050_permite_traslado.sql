-- Tres banderas de configuración por unidad, apagadas por defecto:
-- - permite_traslado: si (siendo de una edificación con otras del mismo
--   propietario) se permite trasladar a su inquilino a otra unidad de ahí.
-- - requiere_codeudor: si esta unidad exige codeudor sí o sí, más allá de lo
--   que el ingreso de cada aplicante ya exija.
-- - frecuencia_pago_flexible: si el inquilino puede pactar una frecuencia de
--   pago distinta a la mensual (quincenal, semanal) en vez de la fija.
ALTER TABLE inmuebles
  ADD COLUMN permite_traslado TINYINT(1) NOT NULL DEFAULT 0 AFTER edificacion_id,
  ADD COLUMN requiere_codeudor TINYINT(1) NOT NULL DEFAULT 0 AFTER permite_traslado,
  ADD COLUMN frecuencia_pago_flexible TINYINT(1) NOT NULL DEFAULT 0 AFTER requiere_codeudor;
