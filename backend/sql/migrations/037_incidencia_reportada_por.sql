-- Quién reportó, en palabras: cuando el propietario registra por otra persona
-- (un inquilino que llamó, una unidad que avisó), lo escribe acá.
ALTER TABLE incidencias ADD COLUMN reportada_por_nombre VARCHAR(191) NULL AFTER celular_reporta;
