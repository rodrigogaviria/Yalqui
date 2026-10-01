-- Quién cobró el gasto: el plomero, la ferretería, la aseguradora. Texto
-- libre, como la nota; no pasa por el catálogo de proveedores de incidencias
-- porque ese lo administra Yalqui, no cada propietario.
ALTER TABLE movimientos ADD COLUMN proveedor VARCHAR(191) NULL AFTER nota;
