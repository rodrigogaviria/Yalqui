-- 022 · Los servicios de Yalqui dejan de ser un ENUM cerrado.
--
-- `servicios.codigo` tenía ocho valores fijos, del mismo tipo de restricción
-- que ya se corrigió en incidencias y movimientos: un ENUM sirve para cerrar
-- un dominio que el código conoce, pero acá nada del código distingue un
-- código de otro — solo se lee y se muestra. Bloquear un servicio nuevo de
-- Yalqui detrás de una migración no tiene la misma justificación que
-- `tipos_inmueble`, donde el marco legal sí depende del tipo.

ALTER TABLE servicios MODIFY codigo VARCHAR(60) NOT NULL;
