-- Cómo calificó el inquilino la solución, de 1 a 5 (la carita), con un
-- comentario opcional. Solo tiene sentido una vez resuelta.
ALTER TABLE incidencias
  ADD COLUMN calificacion TINYINT UNSIGNED NULL AFTER cerrada_at,
  ADD COLUMN calificacion_comentario VARCHAR(500) NULL AFTER calificacion,
  ADD COLUMN calificada_at TIMESTAMP NULL AFTER calificacion_comentario,
  ADD CONSTRAINT ck_incid_calificacion CHECK (calificacion IS NULL OR calificacion BETWEEN 1 AND 5);
