-- Fase 2 · Semillas. Todo INSERT IGNORE: crean lo que falta y nunca tocan lo
-- existente, para que reaplicar la migración sea inofensivo.

-- Los pesos son criterio técnico, no decisión comercial tomada. Pagos pesa más
-- porque es el único dato objetivo, automático y difícil de disputar.
-- documentacion nace en 0 hasta decidir si vale la pena medirla.
INSERT IGNORE INTO dimensiones_score
  (codigo, nombre, explicacion_publica, como_mejorar, peso, ventana_meses, calculo, orden, vigente_desde)
VALUES
  ('pagos', 'Cumplimiento de pagos',
   'Mide si pagaste el arriendo a tiempo.',
   'Pagá antes del vencimiento. Un pago puntual suma; uno tardío resta menos entre más pronto se ponga al día.',
   0.400, 24, 'automatico', 1, CURDATE()),
  ('cuidado_inmueble', 'Cuidado del inmueble',
   'Mide el estado en que mantenés la unidad, comparando el acta de entrada con la de salida.',
   'Reportá los daños apenas ocurran. El desgaste normal no cuenta en tu contra.',
   0.250, 24, 'mixto', 2, CURDATE()),
  ('convivencia', 'Convivencia',
   'Mide las quejas de vecinos resueltas en tu contra, y también los reconocimientos.',
   'Ayudar a un vecino suma. Una queja solo cuenta si se resuelve en contra tuya tras tus descargos.',
   0.250, 18, 'mixto', 3, CURDATE()),
  ('comunicacion', 'Comunicación',
   'Mide si respondés a tiempo los avisos y las solicitudes de documentos.',
   'Contestá los comunicados que piden confirmación y subí los documentos cuando te los pidan.',
   0.100, 12, 'automatico', 4, CURDATE()),
  ('documentacion', 'Documentación',
   'Mide si entregás a tiempo lo que se te pide.',
   'Subí los soportes completos la primera vez.',
   0.000, 12, 'automatico', 5, CURDATE());

INSERT IGNORE INTO servicios (codigo, nombre, descripcion, modelo_cobro, precio_base, porcentaje, requiere_contrato)
VALUES
  ('pricing_engine',       'Yalqui Pricing Engine', 'Canon sugerido y precio de cada ajuste',       'por_uso',    NULL, NULL, FALSE),
  ('screening',            'Yalqui Screening',      'Identidad, antecedentes y central de riesgo',  'por_uso',    NULL, NULL, FALSE),
  ('legal',                'Yalqui Legal',          'Plantillas por marco legal y expediente de mora','recurrente', NULL, NULL, FALSE),
  ('negotiate',            'Yalqui Negotiate',      'Contraofertas sobre el canon',                 'por_uso',    NULL, NULL, FALSE),
  ('cobranza',             'Cobranza automática',   'Recordatorios escalados por días de mora',     'recurrente', NULL, NULL, TRUE),
  ('promocion',            'Promoción digital',     'Publicación en Facebook, Instagram y anuncios','por_uso',    NULL, NULL, FALSE),
  ('seguro_arrendamiento', 'Seguro de arrendamiento','Aliado y condiciones por definir',            'porcentaje', NULL, NULL, TRUE),
  ('factoraje',            'Factoraje de rentas',   'Aliado y condiciones por definir',             'porcentaje', NULL, NULL, TRUE);

-- Marketplace nace no_disponible a propósito: Meta solo lo permite por programa
-- de socios cerrado, hoy limitado a portales de Estados Unidos.
INSERT IGNORE INTO canales_publicacion
  (codigo, nombre, proveedor, requiere_aprobacion, estado, limite_fotos)
VALUES
  ('facebook_page',       'Página de Facebook',        'meta', FALSE, 'no_disponible', 30),
  ('instagram',           'Instagram',                 'meta', FALSE, 'no_disponible', 10),
  ('meta_catalog',        'Catálogo de anuncios Meta', 'meta', FALSE, 'no_disponible', 20),
  ('marketplace_partner', 'Facebook Marketplace',      'meta', TRUE,  'no_disponible', 20);

INSERT IGNORE INTO proveedores_verificacion (codigo, nombre, tipos_soportados, modo, vigencia_dias, activo)
VALUES
  ('truora', 'Truora',
   JSON_ARRAY('identidad','documento','antecedentes_judiciales','antecedentes_policiales','listas_restrictivas'),
   'api', 90, FALSE),
  ('central_riesgo', 'Central de riesgo', JSON_ARRAY('centrales_riesgo'), 'api', 30, FALSE),
  ('manual', 'Revisión manual', JSON_ARRAY('laboral'), 'manual', 90, TRUE);

-- La matriz de permisos. Las filas con condicion dependen de una columna y no
-- solo del rol. Los «nunca» del personal y del administrador no están acá
-- porque ausencia de fila ya es ausencia de permiso.
INSERT IGNORE INTO permisos_rol (rol, ambito_tipo, permiso, condicion) VALUES
  ('propietario','inmueble','ver_unidad',NULL),
  ('propietario','inmueble','editar_canon',NULL),
  ('propietario','inmueble','publicar',NULL),
  ('propietario','inmueble','aprobar_aplicacion',NULL),
  ('propietario','inmueble','verificar_pago',NULL),
  ('propietario','inmueble','ver_finanzas',NULL),
  ('propietario','inmueble','crear_comunicado',NULL),
  ('propietario','inmueble','ver_score_aplicante','consentimiento_vigente'),
  ('socio_propietario','inmueble','ver_unidad',NULL),
  ('socio_propietario','inmueble','ver_finanzas','puede_ver_finanzas'),
  ('socio_propietario','inmueble','aprobar_aplicacion','puede_decidir'),
  ('socio_propietario','inmueble','firmar_contrato','aparece_en_titulo'),
  ('inquilino','contrato','ver_unidad',NULL),
  ('inquilino','contrato','reportar_pago',NULL),
  ('inquilino','contrato','reportar_incidencia',NULL),
  ('inquilino','contrato','ver_score_propio',NULL),
  ('inquilino','contrato','pedir_ayuda_vecino',NULL),
  ('administrador_inmueble','edificacion','ver_unidad_sin_cifras',NULL),
  ('administrador_inmueble','edificacion','resolver_pqrs',NULL),
  ('administrador_inmueble','edificacion','incidencia_area_comun',NULL),
  ('administrador_inmueble','edificacion','crear_comunicado',NULL),
  ('administrador_inmueble','edificacion','gestionar_personal',NULL),
  ('administrador_inmueble','edificacion','confirmar_visita',NULL),
  ('personal_propiedad','edificacion','ver_unidad_sin_cifras',NULL),
  ('personal_propiedad','edificacion','reportar_incidencia',NULL),
  ('personal_propiedad','edificacion','registrar_pqrs',NULL),
  ('personal_propiedad','edificacion','confirmar_visita',NULL),
  ('proveedor','global','cotizar_incidencia',NULL),
  ('proveedor','global','ejecutar_mantenimiento',NULL);
