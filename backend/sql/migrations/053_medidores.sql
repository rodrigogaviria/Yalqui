-- Un medidor físico de un servicio, de una unidad o de toda la edificación.
-- Reemplaza el texto libre de «número de medidor» por un catálogo: una
-- edificación puede tener varios medidores del mismo servicio (Belén tiene
-- cinco de gas), así que lo único que no se repite es el número dentro de
-- ese ámbito y ese servicio.
CREATE TABLE medidores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ambito_tipo ENUM('inmueble', 'edificacion') NOT NULL,
  ambito_id INT UNSIGNED NOT NULL,
  tipo_factura_id INT UNSIGNED NOT NULL,
  numero VARCHAR(40) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_medidor (ambito_tipo, ambito_id, tipo_factura_id, numero),
  KEY ix_medidor_ambito (ambito_tipo, ambito_id),
  CONSTRAINT fk_medidor_tipo FOREIGN KEY (tipo_factura_id) REFERENCES tipos_factura(id) ON DELETE CASCADE
);

ALTER TABLE facturas_propiedad
  ADD COLUMN medidor_id INT UNSIGNED NULL AFTER numero_medidor,
  ADD CONSTRAINT fk_factura_medidor FOREIGN KEY (medidor_id) REFERENCES medidores(id) ON DELETE SET NULL;
