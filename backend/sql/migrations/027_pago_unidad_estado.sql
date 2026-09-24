-- 027 · Un pago subido por el inquilino espera la confirmación del propietario.
--
-- Los que sube el propietario nacen `confirmado`: él es quien recibe la plata y
-- no tiene a quién pedirle confirmación. Los del inquilino nacen `pendiente`
-- y solo cuentan —para el calendario y la fecha del último pago— cuando el
-- propietario los confirma; si no, cualquiera podría poner un mes en verde.

ALTER TABLE pagos_unidad
  ADD COLUMN estado ENUM('pendiente','confirmado','rechazado') NOT NULL DEFAULT 'confirmado' AFTER medio,
  ADD COLUMN motivo_rechazo VARCHAR(500) NULL AFTER estado;
