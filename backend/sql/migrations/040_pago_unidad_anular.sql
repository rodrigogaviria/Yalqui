-- Un pago registrado (por el propietario o ya confirmado del inquilino) se
-- puede anular si se cargó mal, sin borrarlo: queda como rastro, fuera de
-- los totales. Reusa `motivo_rechazo` para guardar por qué.
ALTER TABLE pagos_unidad
  MODIFY COLUMN estado ENUM('pendiente','confirmado','rechazado','anulado') NOT NULL DEFAULT 'confirmado';
