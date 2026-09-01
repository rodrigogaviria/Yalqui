-- 019 · El texto del contrato, ya con los datos adentro.
--
-- Hasta ahora el contrato guardaba a qué plantilla apuntaba, pero nadie podía
-- leer lo que las partes iban a firmar: los marcadores {{ }} nunca se
-- reemplazaban.
--
-- El texto se congela al generar y no se vuelve a calcular. Reconstruirlo
-- después desde la plantilla y los datos actuales daría un documento distinto
-- del que se firmó cada vez que alguien corrigiera un teléfono. `hash_documento`
-- existe justamente para probar que el texto no cambió, y necesita un texto.

ALTER TABLE contratos
  ADD COLUMN texto MEDIUMTEXT NULL AFTER plantilla_version;
