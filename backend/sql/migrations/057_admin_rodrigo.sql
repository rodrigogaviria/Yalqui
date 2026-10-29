-- Le da acceso de administración de Yalqui a la cuenta del dueño del
-- proyecto. Quedó como la única cuenta admin, sin otra con la que
-- recuperar el acceso si hiciera falta.
INSERT INTO usuario_roles (usuario_id, rol, ambito_tipo, ambito_id, otorgado_at)
SELECT id, 'admin_yalqui', 'global', 0, NOW()
FROM usuarios WHERE email = 'rodrigo.gaviria@gmail.com'
ON DUPLICATE KEY UPDATE revocado_at = NULL, otorgado_at = NOW();
