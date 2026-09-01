-- 005 · Qué desbloquea cada plan, y los catálogos que el sistema necesita
-- para funcionar. Datos de referencia, no de ejemplo: sin ellos no se puede
-- crear una suscripción ni armar un canon.
--
-- Fuente de los planes: anexo comercial de planes y precios.
-- Los INSERT son INSERT IGNORE: crean lo que falta y NUNCA tocan lo existente.
-- Repreciar es un UPDATE desde la administración, no una migración.

CREATE TABLE IF NOT EXISTS plan_caracteristicas (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id              INT UNSIGNED NOT NULL,
  caracteristica_codigo VARCHAR(60) NOT NULL,
  nombre               VARCHAR(191) NOT NULL,
  incluida             BOOLEAN NOT NULL DEFAULT TRUE,
  limite               INT UNSIGNED NULL,
  nota                 VARCHAR(255) NULL,
  orden                SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_plancar (plan_id, caracteristica_codigo),
  KEY ix_plancar_codigo (caracteristica_codigo),
  CONSTRAINT fk_plancar_plan FOREIGN KEY (plan_id) REFERENCES planes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tres planes, todos de pago. La segmentación por número de inmuebles es
-- orientativa («ideal para»), no un tope que el sistema deba hacer cumplir.
INSERT IGNORE INTO planes (codigo, nombre, descripcion, precio_mes, moneda, ciclo_default, activo, orden)
VALUES
  ('basico',      'Básico',      'Para empezar con una unidad, sin costo',        0.00, 'COP', 'mensual', TRUE, 1),
  ('profesional', 'Profesional', 'Cobranza automática y rentabilidad por unidad', 20000.00, 'COP', 'mensual', TRUE, 2),
  ('empresarial', 'Empresarial', 'Edificaciones, incidencias y obligaciones',     25000.00, 'COP', 'mensual', TRUE, 3),
  ('corporativo', 'Corporativo', 'Motor de precios y reportes para el contador',  30000.00, 'COP', 'mensual', TRUE, 4);

-- Qué desbloquea cada plan. PENDIENTE_DE_DEFINIR: este cuadro es una propuesta,
-- no una decisión tomada — es lo único que hoy separa a Empresarial de
-- Corporativo. Vive como datos justamente para poder cambiarlo sin migración.
--
-- Se guardan RESUELTAS por plan y no como herencia: «todo lo del plan anterior»
-- se expande acá, para que preguntar si un plan incluye una función sea una
-- consulta y no un recorrido de la escalera.
INSERT IGNORE INTO plan_caracteristicas (plan_id, caracteristica_codigo, nombre, orden)
SELECT p.id, c.codigo, c.nombre, c.orden FROM planes p JOIN (
  SELECT 'basico' AS plan, 'publicar_unidad' AS codigo, 'Publicar la unidad y agendar visitas' AS nombre, 1 AS orden
  UNION ALL SELECT 'basico', 'precalificacion',        'Precalificar interesados en la visita', 2
  UNION ALL SELECT 'basico', 'contrato_firma',         'Contrato digital y firma por WhatsApp', 3
  UNION ALL SELECT 'basico', 'facturacion_canon',      'Facturación del canon y comprobantes', 4

  UNION ALL SELECT 'profesional', 'publicar_unidad',   'Publicar la unidad y agendar visitas', 1
  UNION ALL SELECT 'profesional', 'precalificacion',   'Precalificar interesados en la visita', 2
  UNION ALL SELECT 'profesional', 'contrato_firma',    'Contrato digital y firma por WhatsApp', 3
  UNION ALL SELECT 'profesional', 'facturacion_canon', 'Facturación del canon y comprobantes', 4
  UNION ALL SELECT 'profesional', 'cobranza_automatica','Cobranza automática', 5
  UNION ALL SELECT 'profesional', 'comunicados_whatsapp','Comunicados por WhatsApp', 6
  UNION ALL SELECT 'profesional', 'rentabilidad_unidad','Rentabilidad por unidad', 7

  UNION ALL SELECT 'empresarial', 'publicar_unidad',   'Publicar la unidad y agendar visitas', 1
  UNION ALL SELECT 'empresarial', 'precalificacion',   'Precalificar interesados en la visita', 2
  UNION ALL SELECT 'empresarial', 'contrato_firma',    'Contrato digital y firma por WhatsApp', 3
  UNION ALL SELECT 'empresarial', 'facturacion_canon', 'Facturación del canon y comprobantes', 4
  UNION ALL SELECT 'empresarial', 'cobranza_automatica','Cobranza automática', 5
  UNION ALL SELECT 'empresarial', 'comunicados_whatsapp','Comunicados por WhatsApp', 6
  UNION ALL SELECT 'empresarial', 'rentabilidad_unidad','Rentabilidad por unidad', 7
  UNION ALL SELECT 'empresarial', 'edificaciones',     'Gestión de edificaciones y zonas comunes', 8
  UNION ALL SELECT 'empresarial', 'incidencias',       'Incidencias y proveedores', 9
  UNION ALL SELECT 'empresarial', 'obligaciones',      'Calendario de obligaciones del propietario', 10

  UNION ALL SELECT 'corporativo', 'publicar_unidad',   'Publicar la unidad y agendar visitas', 1
  UNION ALL SELECT 'corporativo', 'precalificacion',   'Precalificar interesados en la visita', 2
  UNION ALL SELECT 'corporativo', 'contrato_firma',    'Contrato digital y firma por WhatsApp', 3
  UNION ALL SELECT 'corporativo', 'facturacion_canon', 'Facturación del canon y comprobantes', 4
  UNION ALL SELECT 'corporativo', 'cobranza_automatica','Cobranza automática', 5
  UNION ALL SELECT 'corporativo', 'comunicados_whatsapp','Comunicados por WhatsApp', 6
  UNION ALL SELECT 'corporativo', 'rentabilidad_unidad','Rentabilidad por unidad', 7
  UNION ALL SELECT 'corporativo', 'edificaciones',     'Gestión de edificaciones y zonas comunes', 8
  UNION ALL SELECT 'corporativo', 'incidencias',       'Incidencias y proveedores', 9
  UNION ALL SELECT 'corporativo', 'obligaciones',      'Calendario de obligaciones del propietario', 10
  UNION ALL SELECT 'corporativo', 'motor_precios',     'Motor de precios sugeridos', 11
  UNION ALL SELECT 'corporativo', 'reportes_contador', 'Reportes anuales para el contador', 12
) c ON c.plan = p.codigo;

-- Catálogo de ajustes del canon. Lo administra Yalqui para que los avisos sean
-- comparables entre sí y el buscador pueda filtrar sin adivinar.
INSERT IGNORE INTO catalogo_ajustes
  (codigo, nombre, descripcion, categoria, tipo_calculo, periodicidad, permite_cantidad, activo, orden)
VALUES
  ('amoblado',          'Amoblado',          'Se entrega con muebles y electrodomésticos', 'comodidad',   'monto_fijo',   'mensual', FALSE, TRUE, 1),
  ('parqueadero',       'Parqueadero',       'Celda de parqueo asociada a la unidad',      'parqueadero', 'por_cantidad', 'mensual', TRUE,  TRUE, 2),
  ('mascota',           'Mascota',           'Mascota autorizada dentro de la unidad',     'mascota',     'por_cantidad', 'mensual', TRUE,  TRUE, 3),
  ('persona_adicional', 'Persona adicional', 'Ocupante por encima de los que incluye el canon', 'ocupacion', 'por_cantidad', 'mensual', TRUE, TRUE, 4),
  ('deposito_bodega',   'Depósito o bodega', 'Espacio de almacenamiento adicional',        'comodidad',   'monto_fijo',   'mensual', FALSE, TRUE, 5),
  ('aseo',              'Servicio de aseo',  'Aseo periódico incluido en el canon',        'servicio',    'monto_fijo',   'mensual', FALSE, TRUE, 6),
  ('internet',          'Internet',          'Conexión a internet incluida en el canon',   'servicio',    'monto_fijo',   'mensual', FALSE, TRUE, 7);

-- Regla de precalificación por defecto. El tope por unidad vive en
-- inmuebles.tope_ingreso_pct; esta regla define los escalones intermedios.
INSERT IGNORE INTO reglas_precalificacion
  (codigo, nombre, version, umbral_holgado, umbral_ajustado, umbral_limite, exige_aportante_desde, estado, vigente_desde)
VALUES
  ('base', 'Regla base de precalificación', 1, 35.00, 45.00, 50.00, 50.00, 'vigente', CURDATE());
