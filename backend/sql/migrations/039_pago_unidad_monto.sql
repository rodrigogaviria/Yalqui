-- Cuánto fue cada pago. Antes «pago» era binario (pagado o no); con el monto
-- se puede anexar más de uno al mismo período, cada uno con su medio: parte
-- en efectivo, parte por transferencia.
ALTER TABLE pagos_unidad ADD COLUMN monto DECIMAL(14,2) NULL AFTER medio;
