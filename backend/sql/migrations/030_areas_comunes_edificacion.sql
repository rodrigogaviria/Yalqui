-- 030 · Las áreas comunes son de la edificación, no de cada unidad.
--
-- Un «Salón social» existe una sola vez en el edificio; configurarlo unidad
-- por unidad lo duplicaba veinticuatro veces. Un área ahora pertenece a una
-- edificación o, si la unidad es suelta, a esa unidad: exactamente una de las
-- dos.
--
-- Las áreas que ya colgaban de unidades de una edificación pasan a ella. Si
-- varias unidades tenían la misma (mismo nombre), quedan en una sola y las
-- reservas que apuntaban a las repetidas se reasignan a la que se conserva.

ALTER TABLE areas_comunes
  MODIFY inmueble_id INT UNSIGNED NULL,
  ADD COLUMN edificacion_id INT UNSIGNED NULL AFTER inmueble_id,
  ADD KEY ix_areascomunes_edificacion (edificacion_id, activa),
  ADD CONSTRAINT fk_areascomunes_edificacion FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE;

UPDATE areas_comunes a
  JOIN inmuebles i ON i.id = a.inmueble_id
  SET a.edificacion_id = i.edificacion_id
  WHERE i.edificacion_id IS NOT NULL;

UPDATE reservas r
  JOIN areas_comunes a ON a.id = r.area_comun_id
  JOIN (SELECT edificacion_id, nombre, MIN(id) AS conservada
          FROM areas_comunes WHERE edificacion_id IS NOT NULL
          GROUP BY edificacion_id, nombre) m
    ON m.edificacion_id = a.edificacion_id AND m.nombre = a.nombre
  SET r.area_comun_id = m.conservada
  WHERE a.id <> m.conservada;

DELETE a FROM areas_comunes a
  JOIN (SELECT edificacion_id, nombre, MIN(id) AS conservada
          FROM areas_comunes WHERE edificacion_id IS NOT NULL
          GROUP BY edificacion_id, nombre) m
    ON m.edificacion_id = a.edificacion_id AND m.nombre = a.nombre
  WHERE a.id <> m.conservada;

UPDATE areas_comunes SET inmueble_id = NULL WHERE edificacion_id IS NOT NULL;

ALTER TABLE areas_comunes
  ADD CONSTRAINT ck_areascomunes_sitio CHECK ((inmueble_id IS NOT NULL) <> (edificacion_id IS NOT NULL));
