-- 028 · Un comunicado para varias unidades es un solo comunicado.
--
-- Hasta ahora una unidad era una columna de `comunicados`, así que escribir el
-- mismo aviso para diez unidades dejaba diez filas y diez historiales. Esta
-- tabla lista a qué unidades va cada comunicado: es la fuente de verdad de su
-- alcance. `comunicados.inmueble_id` se conserva solo cuando va a una única
-- unidad.

CREATE TABLE IF NOT EXISTS comunicado_unidades (
  comunicado_id INT UNSIGNED NOT NULL,
  inmueble_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (comunicado_id, inmueble_id),
  KEY ix_comunidades_inmueble (inmueble_id),
  CONSTRAINT fk_comunidades_comunicado FOREIGN KEY (comunicado_id) REFERENCES comunicados(id) ON DELETE CASCADE,
  CONSTRAINT fk_comunidades_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO comunicado_unidades (comunicado_id, inmueble_id)
SELECT id, inmueble_id FROM comunicados WHERE ambito = 'unidad' AND inmueble_id IS NOT NULL;
