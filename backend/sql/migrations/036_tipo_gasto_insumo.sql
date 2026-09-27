-- Tipo de gasto «Insumo»: lo que se compra para la propiedad (bombillos, aseo, dotación).
INSERT INTO tipos_movimiento (codigo, nombre, tipo, descripcion, deducible, ambito, responsable, orden)
SELECT 'insumo', 'Insumo', 'egreso', 'Lo que se compra para la propiedad: aseo, bombillos, dotación.', TRUE, 'ambos', 'propietario', 11
WHERE NOT EXISTS (SELECT 1 FROM tipos_movimiento WHERE codigo = 'insumo');
