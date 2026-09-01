-- 016 · Las incidencias y los movimientos apuntan al catálogo, no a un ENUM.
--
-- `incidencias.categoria` era un ENUM de ocho valores y el catálogo que se
-- administra tiene catorce: registrar una incidencia de gas o de jardinería
-- fallaba contra la restricción de la columna. Peor que fallar: dejaba la
-- pantalla de configuración prometiendo tipos que no se podían usar.
--
-- Se hace ahora porque las dos tablas están vacías. Con datos adentro habría
-- que mapear cada fila y decidir qué hacer con las que no tuvieran equivalente.

ALTER TABLE incidencias
  ADD COLUMN tipo_incidencia_id INT UNSIGNED NULL AFTER reportada_por_id,
  ADD CONSTRAINT fk_incid_tipo FOREIGN KEY (tipo_incidencia_id)
    REFERENCES tipos_incidencia(id) ON DELETE RESTRICT;

-- La columna vieja se queda pero deja de mandar: es NULL a partir de ahora y
-- solo sostiene los índices existentes. Borrarla es una migración aparte, para
-- que este cambio se pueda revertir sin perder nada.
ALTER TABLE incidencias MODIFY categoria
  ENUM('plomeria','electrico','estructural','electrodomesticos','cerrajeria','humedad','ascensor','otro') NULL;

-- Lo mismo con la categoría de los movimientos: el catálogo de tipos de
-- ingreso y egreso es lo que se configura, así que es lo que debe mandar.
ALTER TABLE movimientos
  ADD COLUMN tipo_movimiento_id INT UNSIGNED NULL AFTER tipo,
  ADD CONSTRAINT fk_mov_tipo FOREIGN KEY (tipo_movimiento_id)
    REFERENCES tipos_movimiento(id) ON DELETE RESTRICT;

ALTER TABLE movimientos MODIFY categoria
  ENUM('canon','administracion','mantenimiento','fachada','zonas_comunes','impuesto_predial',
       'seguro','suscripcion_yalqui','servicio_yalqui','otro') NULL;
