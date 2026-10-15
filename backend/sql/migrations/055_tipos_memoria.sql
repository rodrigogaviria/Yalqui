-- Los tipos de memoria pasan de ser un ENUM fijo a un catálogo editable,
-- igual que tipos_inmueble: la administración de Yalqui puede agregar uno
-- nuevo sin que haga falta una migración cada vez.
CREATE TABLE tipos_memoria (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tipomemoria_codigo (codigo)
);

INSERT INTO tipos_memoria (codigo, nombre, orden) VALUES
  ('certificaciones', 'Certificaciones', 1),
  ('descripcion_visual', 'Descripción Visual', 2),
  ('documentos_contables', 'Documentos Contables', 3),
  ('fichas_tecnicas', 'Fichas Técnicas', 4),
  ('licencias', 'Licencias', 5),
  ('otros', 'Otros', 6),
  ('planos_arquitectonicos', 'Planos Arquitectónicos', 7),
  ('planos_electricos', 'Planos Eléctricos', 8),
  ('planos_estructurales', 'Planos Estructurales', 9),
  ('planos_hidraulicos', 'Planos Hidráulicos', 10);

ALTER TABLE inmueble_memorias ADD COLUMN tipo_memoria_id INT UNSIGNED NULL AFTER tipo;

UPDATE inmueble_memorias im
  JOIN tipos_memoria tm ON tm.codigo = im.tipo
  SET im.tipo_memoria_id = tm.id;

ALTER TABLE inmueble_memorias
  DROP INDEX ix_memorias_inmueble_tipo,
  DROP INDEX ix_memorias_edificacion_tipo,
  MODIFY COLUMN tipo_memoria_id INT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_memoria_tipo FOREIGN KEY (tipo_memoria_id) REFERENCES tipos_memoria(id),
  ADD INDEX ix_memorias_inmueble_tipo (inmueble_id, tipo_memoria_id),
  ADD INDEX ix_memorias_edificacion_tipo (edificacion_id, tipo_memoria_id),
  DROP COLUMN tipo;
