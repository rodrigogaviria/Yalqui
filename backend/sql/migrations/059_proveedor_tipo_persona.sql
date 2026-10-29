-- Persona natural (Cédula de Ciudadanía) o jurídica (NIT): hasta ahora
-- `darAccesoProveedor` asumía NIT siempre, así que un proveedor natural
-- terminaba con un tipo de documento que no era el suyo.
ALTER TABLE proveedores
  ADD COLUMN tipo_persona ENUM('natural', 'juridica') NOT NULL DEFAULT 'juridica' AFTER razon_social;
