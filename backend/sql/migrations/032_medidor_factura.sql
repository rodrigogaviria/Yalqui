-- 032 · El número de medidor de las facturas de agua, energía y gas.
--
-- Esas facturas son de un medidor concreto, y sin su número no se sabe a
-- cuál corresponden cuando una propiedad tiene más de uno. Es el tipo de
-- factura, configurable, el que decide si lo pide; en la factura se guarda
-- el número.

ALTER TABLE tipos_factura
  ADD COLUMN requiere_medidor BOOLEAN NOT NULL DEFAULT FALSE AFTER periodicidad;

UPDATE tipos_factura SET requiere_medidor = TRUE WHERE codigo IN ('agua', 'energia', 'gas');

ALTER TABLE facturas_propiedad
  ADD COLUMN numero_medidor VARCHAR(40) NULL AFTER responsable;
