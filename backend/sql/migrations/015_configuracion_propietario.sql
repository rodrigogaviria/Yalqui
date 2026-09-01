-- 015 · Lo que cada propietario decide sobre su propia unidad.
--
-- Los catálogos globales dicen qué es posible; estas filas dicen qué eligió
-- este propietario para esta unidad. Precio de cada servicio adicional en
-- `inmueble_ajustes`, que ya existía, y qué le exige a quien quiera arrendar
-- acá abajo.

CREATE TABLE IF NOT EXISTS inmueble_requisitos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id  INT UNSIGNED NOT NULL,
  requisito_id INT UNSIGNED NOT NULL,
  -- Es una excepción, no una copia del catálogo. Sin fila vale lo que diga
  -- `requisitos.obligatorio`, así que un requisito nuevo que Yalqui agregue
  -- aplica solo a todas las unidades sin que nadie las tenga que recorrer.
  -- Con fila, este propietario decidió lo contrario para esta unidad.
  exigido      BOOLEAN NOT NULL,
  nota         VARCHAR(255) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inmreq (inmueble_id, requisito_id),
  CONSTRAINT fk_inmreq_inmueble FOREIGN KEY (inmueble_id)
    REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_inmreq_requisito FOREIGN KEY (requisito_id)
    REFERENCES requisitos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
