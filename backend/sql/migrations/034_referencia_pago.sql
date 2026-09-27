-- 034 · La referencia de pago de las facturas de internet.
--
-- Internet se paga con una referencia (la del contrato o la de la factura)
-- que hay que digitar en el banco o la pasarela; sin ella no se puede pagar.
-- Igual que el medidor, es el tipo de factura —configurable— el que decide si
-- se pide, y la factura guarda el número.

ALTER TABLE tipos_factura
  ADD COLUMN requiere_referencia BOOLEAN NOT NULL DEFAULT FALSE AFTER requiere_medidor;

UPDATE tipos_factura SET requiere_referencia = TRUE WHERE codigo = 'internet';

ALTER TABLE facturas_propiedad
  ADD COLUMN referencia_pago VARCHAR(60) NULL AFTER numero_medidor;
