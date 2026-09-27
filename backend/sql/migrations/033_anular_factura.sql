-- 033 · Las facturas de la propiedad se anulan, no se borran.
--
-- Una factura registrada es un rastro de plata: borrarla deja un hueco que
-- nadie puede explicar después. Anularla la deja a la vista con su motivo,
-- quién la anuló y cuándo, y la saca de los totales.

ALTER TABLE facturas_propiedad
  MODIFY estado ENUM('sin_pagar','pagado','anulada') NOT NULL DEFAULT 'sin_pagar',
  ADD COLUMN motivo_anulacion VARCHAR(500) NULL,
  ADD COLUMN anulada_at TIMESTAMP NULL,
  ADD COLUMN anulada_por_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_factprop_anulador FOREIGN KEY (anulada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
