-- 023 · Contraseña temporal con cambio obligatorio.
--
-- El inquilino que un propietario da de alta no recibe ya un enlace de
-- activación: la cuenta nace con la contraseña "123456" y esta bandera en
-- true. El propietario se la dice de palabra o por WhatsApp, sin depender de
-- que el correo con el enlace llegue o no se vaya a spam. La primera vez que
-- esa persona entra, el sistema la obliga a cambiarla antes de dejarla ver
-- nada — así una contraseña que cualquiera puede adivinar no sigue siendo
-- válida más de un ingreso.
--
-- Sirve además para el reinicio de contraseña que hace un administrador desde
-- Usuarios y roles: pone una nueva a mano y esta bandera en true, sin tener
-- que conocer la que la persona tenía.

ALTER TABLE usuarios
  ADD COLUMN debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT FALSE AFTER password_hash;
