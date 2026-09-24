-- 025 · Día previsto de pago y días de gracia, por unidad.
--
-- Hasta ahora el día de pago vivía solo en el contrato y los días de gracia
-- eran un parámetro global. Cada unidad tiene su propio acuerdo, así que
-- ambos pasan a la unidad: el contrato toma de ahí el día de pago al
-- generarse, y la mora empieza a contar después de la gracia.

ALTER TABLE inmuebles
  ADD COLUMN dia_pago TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER valor_administracion,
  ADD COLUMN dias_gracia TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER dia_pago;
