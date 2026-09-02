-- 021 · El teléfono de quien reporta una incidencia.
--
-- Sin él, atender una fuga obliga a buscar en otra pantalla a quién llamar. Se
-- guarda en la incidencia y no se lee del usuario en el momento de atenderla:
-- quien reporta puede dar un número distinto al de su cuenta —el del vecino que
-- va a abrir la puerta, por ejemplo— y ese es el que sirve para esa incidencia.

ALTER TABLE incidencias
  ADD COLUMN celular_reporta VARCHAR(30) NULL AFTER reportada_por_id;
