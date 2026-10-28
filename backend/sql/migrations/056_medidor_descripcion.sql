-- Una nota corta para distinguir medidores del mismo servicio a simple
-- vista —"Piso 3A", "Torre 2"— sin depender solo del número grabado en el
-- aparato.
ALTER TABLE medidores
  ADD COLUMN descripcion VARCHAR(120) NULL AFTER numero;
