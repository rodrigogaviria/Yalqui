-- La fecha de inicio y fin del contrato en curso, a nivel de unidad: el
-- camino directo para el propietario que no pasa por generar el documento
-- formal. Desde la fecha de inicio, el calendario de Mis Pagos empieza a
-- mostrar el día previsto de pago de esa unidad; en la fecha de fin, deja.
ALTER TABLE inmuebles
  ADD COLUMN contrato_fecha_inicio DATE NULL AFTER dias_gracia,
  ADD COLUMN contrato_fecha_fin DATE NULL AFTER contrato_fecha_inicio;
