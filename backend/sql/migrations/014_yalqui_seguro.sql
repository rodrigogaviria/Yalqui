-- 014 · Yalqui Seguro: nombre definitivo y precio.
--
-- No crea una fila nueva. El servicio ya existía como `seguro_arrendamiento`
-- desde la migración 005, sin precio y cobrado por porcentaje. Acá pasa a
-- llamarse como la familia — Yalqui Legal, Yalqui Screening, Yalqui Negotiate —
-- y a cobrarse como cuota mensual fija.
--
-- Va en `servicios` y no en `catalogo_ajustes` a propósito: es un producto que
-- Yalqui le vende al propietario, no un ajuste al canon que el inquilino le
-- paga al propietario. Son los dos flujos de dinero que no se mezclan nunca, y
-- ponerlo del otro lado haría que el inquilino terminara pagando el seguro
-- dentro del arriendo.

UPDATE servicios
SET nombre       = 'Yalqui Seguro',
    descripcion  = 'Cubre al propietario ante el impago del canon. Se cobra por unidad asegurada.',
    modelo_cobro = 'recurrente',
    precio_base  = 40000.00,
    -- El porcentaje queda en NULL: con cuota fija ya no aplica, y dejarlo
    -- puesto haría ambiguo cuál de los dos manda al momento de facturar.
    porcentaje   = NULL,
    moneda       = 'COP'
WHERE codigo = 'seguro_arrendamiento';
