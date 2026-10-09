-- Un tipo de memoria más: certificaciones (de obra, de gas, de ascensores,
-- lo que exija una aseguradora o una entidad). En orden alfabético con el
-- resto, como todo el catálogo de tipos de memoria.
ALTER TABLE inmueble_memorias
  MODIFY COLUMN tipo ENUM(
    'certificaciones', 'descripcion_visual', 'documentos_contables', 'fichas_tecnicas', 'licencias', 'otros',
    'planos_arquitectonicos', 'planos_electricos', 'planos_estructurales', 'planos_hidraulicos'
  ) NOT NULL;
