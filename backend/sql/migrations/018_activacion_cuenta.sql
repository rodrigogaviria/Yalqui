-- 018 · Cuentas creadas por un tercero.
--
-- Cuando el propietario marca una unidad como alquilada, registra al inquilino.
-- Pero si el propietario eligiera la contraseña, tendría acceso a la cuenta de
-- la otra parte: sería su palabra contra la de ella sobre quién firmó el
-- contrato y quién reportó cada pago.
--
-- Por eso la cuenta nace sin contraseña usable y con un enlace de activación
-- que el propietario le pasa. Quien la activa elige su clave, y desde ese
-- momento el propietario no puede entrar.

ALTER TABLE usuarios
  ADD COLUMN activacion_token CHAR(64) NULL AFTER password_hash,
  ADD COLUMN activacion_expira_at TIMESTAMP NULL AFTER activacion_token,
  -- Quién la creó. Sirve para explicar en pantalla por qué esta cuenta existe
  -- sin que su dueño la haya pedido.
  ADD COLUMN creada_por_id INT UNSIGNED NULL AFTER activacion_expira_at,
  ADD KEY ix_usuarios_activacion (activacion_token),
  ADD CONSTRAINT fk_usuarios_creador FOREIGN KEY (creada_por_id)
    REFERENCES usuarios(id) ON DELETE SET NULL;
