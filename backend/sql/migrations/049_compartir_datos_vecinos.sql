-- Preferencia del inquilino de compartir algunos de sus datos (nombre,
-- género, profesión, hobbies, celular) con otras personas de Yalqui, y hasta
-- dónde: su edificación, su sector (mismo barrio) o toda la comunidad Yalqui.
-- Apagada por defecto: nadie queda expuesto sin elegirlo.
ALTER TABLE perfiles_inquilino
  ADD COLUMN compartir_datos_vecinos TINYINT(1) NOT NULL DEFAULT 0 AFTER usuario_id,
  ADD COLUMN alcance_vecinos ENUM('edificacion', 'sector', 'yalqui') NOT NULL DEFAULT 'edificacion' AFTER compartir_datos_vecinos,
  ADD COLUMN emprendimiento_nombre VARCHAR(191) AFTER alcance_vecinos,
  ADD COLUMN emprendimiento_descripcion TEXT AFTER emprendimiento_nombre;
