-- 031 · Una factura puede ser de una unidad o de la edificación.
--
-- El agua del edificio, el seguro de todo el inmueble o el predial de un
-- lote único llegan a nombre de la edificación, no de un apartamento. La
-- factura ahora cuelga de una unidad o de una edificación: exactamente una
-- de las dos.

ALTER TABLE facturas_propiedad
  MODIFY inmueble_id INT UNSIGNED NULL,
  ADD COLUMN edificacion_id INT UNSIGNED NULL AFTER inmueble_id,
  ADD KEY ix_factprop_edificacion (edificacion_id, fecha_vencimiento),
  ADD CONSTRAINT fk_factprop_edificacion FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  ADD CONSTRAINT ck_factprop_sitio CHECK ((inmueble_id IS NOT NULL) <> (edificacion_id IS NOT NULL));
