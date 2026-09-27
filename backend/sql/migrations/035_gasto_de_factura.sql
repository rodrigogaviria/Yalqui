-- 035 · El gasto nace del pago de la factura.
--
-- Una factura es lo que se debe; un gasto es la plata que salió. Cuando el
-- propietario paga una factura suya, el gasto se genera solo, con el valor y
-- la fecha del pago, y se corrige o se retira si la factura se anula, se
-- edita o vuelve a sin pagar. Nunca se digita dos veces.
--
--  · `tipos_factura.tipo_movimiento_id` dice a qué concepto de gasto
--    corresponde cada tipo de factura.
--  · `facturas_propiedad.prorrateo` es cómo se reparte, entre las unidades
--    de la edificación, una factura que es de toda la edificación.
--  · `movimientos.origen_tipo` gana `factura_propiedad`.

ALTER TABLE movimientos
  MODIFY origen_tipo ENUM('pago_arriendo','incidencia','factura_yalqui','obligacion','manual','factura_propiedad') NOT NULL;

ALTER TABLE tipos_factura
  ADD COLUMN tipo_movimiento_id INT UNSIGNED NULL AFTER requiere_referencia,
  ADD CONSTRAINT fk_tipofactura_movimiento FOREIGN KEY (tipo_movimiento_id) REFERENCES tipos_movimiento(id) ON DELETE SET NULL;

UPDATE tipos_factura t
  JOIN tipos_movimiento m ON m.codigo = 'servicios_publicos_pag'
  SET t.tipo_movimiento_id = m.id
  WHERE t.codigo IN ('agua', 'energia', 'gas', 'internet');

UPDATE tipos_factura t
  JOIN tipos_movimiento m ON m.codigo = 'administracion_pag'
  SET t.tipo_movimiento_id = m.id
  WHERE t.codigo = 'administracion';

UPDATE tipos_factura t
  JOIN tipos_movimiento m ON m.codigo = 'impuesto_predial'
  SET t.tipo_movimiento_id = m.id
  WHERE t.codigo = 'predial';

UPDATE tipos_factura t
  JOIN tipos_movimiento m ON m.codigo = 'seguro'
  SET t.tipo_movimiento_id = m.id
  WHERE t.codigo = 'seguro';

ALTER TABLE facturas_propiedad
  ADD COLUMN prorrateo ENUM('ninguno','partes_iguales','por_area','por_canon') NOT NULL DEFAULT 'ninguno' AFTER responsable;
