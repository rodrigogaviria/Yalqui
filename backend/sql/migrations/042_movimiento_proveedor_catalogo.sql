-- El proveedor de un gasto pasa a elegirse del catálogo global de
-- proveedores (el mismo de incidencias), no a escribirse libre. Se guarda el
-- id y, junto a él, la razón social de ese momento en `proveedor` (ya
-- existía): así una fila vieja sigue mostrando el nombre aunque el proveedor
-- se edite o se borre después.
ALTER TABLE movimientos
  ADD COLUMN proveedor_id INT UNSIGNED NULL AFTER proveedor,
  ADD CONSTRAINT fk_movimientos_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;
