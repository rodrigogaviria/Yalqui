-- La plantilla de contrato puede anexar un archivo con la minuta en vez de
-- escribir el texto con marcadores: ese archivo es entonces el documento que
-- se usa al generar el contrato, sin sustitución de {{marcadores}}. Tiene
-- que haber uno de los dos, nunca ninguno.
ALTER TABLE plantillas_contrato
  ADD COLUMN archivo_id BIGINT UNSIGNED NULL AFTER cuerpo,
  MODIFY COLUMN cuerpo MEDIUMTEXT NULL;

ALTER TABLE plantillas_contrato
  ADD CONSTRAINT ck_plantilla_cuerpo_o_archivo CHECK (cuerpo IS NOT NULL OR archivo_id IS NOT NULL);
