-- 013 · Los catálogos que faltaban para operar: qué se cobra además del canon,
-- cómo se clasifica cada peso que entra y sale, qué se le exige a quien va a
-- arrendar y con qué documento lo demuestra.
--
-- Varias de estas cosas vivían como ENUM dentro de una tabla de movimiento.
-- Un ENUM sirve para cerrar un dominio que el código conoce; no sirve cuando
-- lo que hay que poder hacer es agregar una categoría un martes por la tarde.

-- ---------------------------------------------------------------------------
-- Servicios adicionales: el precio sugerido
-- ---------------------------------------------------------------------------
-- `catalogo_ajustes` ya definía qué se puede cobrar aparte del canon, pero el
-- valor vivía solo en `inmueble_ajustes`, es decir una vez por inmueble. Eso
-- obliga a que cada propietario invente el precio de cero. El sugerido es un
-- punto de partida editable, nunca un precio impuesto.
ALTER TABLE catalogo_ajustes
  ADD COLUMN valor_sugerido      DECIMAL(14,2) NULL AFTER permite_cantidad,
  ADD COLUMN porcentaje_sugerido DECIMAL(6,3)  NULL AFTER valor_sugerido;

INSERT IGNORE INTO catalogo_ajustes
  (codigo, nombre, descripcion, categoria, tipo_calculo, periodicidad, permite_cantidad, activo, orden) VALUES
  ('servicios_publicos', 'Servicios públicos',
   'Agua, energía y gas incluidos en el canon en vez de a cargo del inquilino.',
   'servicio', 'monto_fijo', 'mensual', FALSE, TRUE, 8),
  ('television', 'Televisión', 'Plan de TV incluido.', 'servicio', 'monto_fijo', 'mensual', FALSE, TRUE, 9),
  ('gimnasio', 'Gimnasio', 'Acceso al gimnasio del edificio.', 'comodidad', 'monto_fijo', 'mensual', FALSE, TRUE, 10),
  ('lavanderia', 'Lavandería', 'Servicio de lavandería.', 'servicio', 'monto_fijo', 'mensual', FALSE, TRUE, 11),
  ('deposito_adicional', 'Depósito adicional',
   'Cuarto útil o bodega aparte del que ya incluye la unidad.',
   'comodidad', 'por_cantidad', 'mensual', TRUE, TRUE, 12);

-- Valores de referencia para Bogotá y el Valle de Aburrá a 2026. Son un punto
-- de partida para que el formulario no arranque en cero, no una tarifa: cada
-- propietario los ajusta en su unidad.
UPDATE catalogo_ajustes SET valor_sugerido = 350000  WHERE codigo = 'amoblado'           AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 150000  WHERE codigo = 'parqueadero'        AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 50000   WHERE codigo = 'mascota'            AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 200000  WHERE codigo = 'persona_adicional'  AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 80000   WHERE codigo = 'deposito_bodega'    AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 120000  WHERE codigo = 'aseo'               AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 90000   WHERE codigo = 'internet'           AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 250000  WHERE codigo = 'servicios_publicos' AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 60000   WHERE codigo = 'television'         AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 70000   WHERE codigo = 'gimnasio'           AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 90000   WHERE codigo = 'lavanderia'         AND valor_sugerido IS NULL;
UPDATE catalogo_ajustes SET valor_sugerido = 80000   WHERE codigo = 'deposito_adicional' AND valor_sugerido IS NULL;

-- ---------------------------------------------------------------------------
-- Tipos de ingreso y de egreso
-- ---------------------------------------------------------------------------
-- Una sola tabla con discriminador y no dos: ingreso y egreso tienen la misma
-- forma y se consultan juntos en el estado de resultados de un inmueble.
-- Separarlos obligaría a unir dos tablas idénticas en cada consulta.
CREATE TABLE IF NOT EXISTS tipos_movimiento (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo       VARCHAR(40) NOT NULL,
  nombre       VARCHAR(120) NOT NULL,
  tipo         ENUM('ingreso','egreso') NOT NULL,
  descripcion  VARCHAR(255) NULL,
  -- Un egreso deducible baja la renta del propietario. Lo marca el catálogo
  -- para que no haya que decidirlo movimiento por movimiento.
  deducible    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Si el gasto es de la edificación se reparte entre las unidades; si es de
  -- la unidad, no. Es la diferencia entre pintar la fachada y arreglar un grifo.
  ambito       ENUM('unidad','edificacion','ambos') NOT NULL DEFAULT 'ambos',
  -- Quién lo asume por defecto cuando nace de una incidencia.
  responsable  ENUM('propietario','inquilino','compartido','copropiedad','por_definir')
               NOT NULL DEFAULT 'por_definir',
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  orden        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_tipomov_codigo (codigo),
  KEY ix_tipomov_tipo (tipo, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO tipos_movimiento (codigo, nombre, tipo, descripcion, deducible, ambito, responsable, orden) VALUES
  ('canon',              'Canon de arrendamiento', 'ingreso', 'El arriendo del mes.',                    FALSE, 'unidad',      'inquilino',   1),
  ('administracion_cob', 'Administración cobrada', 'ingreso', 'Cuota de administración que paga el inquilino.', FALSE, 'unidad', 'inquilino', 2),
  ('servicios_cobrados', 'Servicios cobrados',     'ingreso', 'Servicios adicionales facturados al inquilino.', FALSE, 'unidad', 'inquilino', 3),
  ('mora',               'Intereses de mora',      'ingreso', 'Interés por pago tardío.',                 FALSE, 'unidad',      'inquilino',   4),
  ('deposito_recibido',  'Depósito recibido',      'ingreso', 'Solo aplica fuera de vivienda urbana.',    FALSE, 'unidad',      'inquilino',   5),
  ('otro_ingreso',       'Otro ingreso',           'ingreso', NULL,                                       FALSE, 'ambos',       'por_definir', 9),

  ('administracion_pag', 'Administración pagada',  'egreso',  'Cuota que el propietario paga a la copropiedad.', TRUE,  'unidad',      'propietario', 1),
  ('mantenimiento',      'Mantenimiento',          'egreso',  'Reparaciones y conservación de la unidad.', TRUE,  'unidad',      'propietario', 2),
  ('fachada',            'Fachada y exteriores',   'egreso',  'Obra sobre el edificio, se prorratea.',     TRUE,  'edificacion', 'copropiedad', 3),
  ('zonas_comunes',      'Zonas comunes',          'egreso',  'Gasto de áreas compartidas.',               TRUE,  'edificacion', 'copropiedad', 4),
  ('impuesto_predial',   'Impuesto predial',       'egreso',  'Se paga anual, se puede prorratear al mes.', TRUE,  'unidad',      'propietario', 5),
  ('valorizacion',       'Valorización',           'egreso',  'Contribución de valorización distrital.',   TRUE,  'unidad',      'propietario', 6),
  ('seguro',             'Seguro',                 'egreso',  'Póliza de la unidad o del arrendamiento.',  TRUE,  'ambos',       'propietario', 7),
  ('servicios_publicos_pag', 'Servicios públicos', 'egreso',  'Cuando los asume el propietario.',          TRUE,  'unidad',      'propietario', 8),
  ('suscripcion_yalqui', 'Suscripción Yalqui',     'egreso',  'El plan mensual por inmueble.',             TRUE,  'unidad',      'propietario', 9),
  ('servicio_yalqui',    'Servicio Yalqui',        'egreso',  'Servicio a la carta contratado.',           TRUE,  'unidad',      'propietario', 10),
  ('otro_egreso',        'Otro egreso',            'egreso',  NULL,                                        FALSE, 'ambos',       'por_definir', 19);

-- ---------------------------------------------------------------------------
-- Tipos de incidencia
-- ---------------------------------------------------------------------------
-- El gremio es además el vocabulario de especialidades de los proveedores: un
-- proveedor atiende los tipos de incidencia que sabe resolver, y no hay dos
-- listas que se puedan desincronizar.
CREATE TABLE IF NOT EXISTS tipos_incidencia (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo               VARCHAR(40) NOT NULL,
  nombre               VARCHAR(120) NOT NULL,
  descripcion          VARCHAR(255) NULL,
  ambito               ENUM('unidad','area_comun','ambos') NOT NULL DEFAULT 'ambos',
  prioridad_sugerida   ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media',
  -- Horas para atender según la prioridad sugerida. Sirve para calcular el
  -- vencimiento del SLA sin que nadie lo escriba a mano en cada incidencia.
  sla_horas            SMALLINT UNSIGNED NULL,
  responsable_sugerido ENUM('propietario','inquilino','compartido','copropiedad','por_definir')
                       NOT NULL DEFAULT 'por_definir',
  tipo_movimiento_id   INT UNSIGNED NULL,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  orden                SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_tipoinc_codigo (codigo),
  CONSTRAINT fk_tipoinc_movimiento FOREIGN KEY (tipo_movimiento_id)
    REFERENCES tipos_movimiento(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO tipos_incidencia
  (codigo, nombre, descripcion, ambito, prioridad_sugerida, sla_horas, responsable_sugerido, orden) VALUES
  ('plomeria',         'Plomería',           'Fugas, desagües, sanitarios y grifería.', 'ambos',      'alta',    24,  'propietario', 1),
  ('electrico',        'Eléctrico',          'Cortos, tomas, tablero y luminarias.',    'ambos',      'alta',    24,  'propietario', 2),
  ('gas',              'Gas',                'Fugas y revisión de red de gas.',         'ambos',      'urgente', 4,   'propietario', 3),
  ('humedad',          'Humedad',            'Filtraciones y hongos.',                  'ambos',      'media',   72,  'propietario', 4),
  ('estructural',      'Estructural',        'Fisuras, cubierta y elementos portantes.','ambos',      'urgente', 12,  'propietario', 5),
  ('cerrajeria',       'Cerrajería',         'Cerraduras, llaves y control de acceso.', 'unidad',     'alta',    12,  'inquilino',   6),
  ('electrodomesticos','Electrodomésticos',  'Los que entrega el propietario.',         'unidad',     'media',   72,  'propietario', 7),
  ('carpinteria',      'Carpintería',        'Puertas, closets y muebles fijos.',       'unidad',     'baja',    120, 'propietario', 8),
  ('pintura',          'Pintura',            'Repintado interior o de fachada.',        'ambos',      'baja',    168, 'propietario', 9),
  ('ascensor',         'Ascensor',           'Falla o mantenimiento del ascensor.',     'area_comun', 'urgente', 8,   'copropiedad', 10),
  ('jardineria',       'Jardinería',         'Zonas verdes y poda.',                    'area_comun', 'baja',    168, 'copropiedad', 11),
  ('aseo_areas',       'Aseo de zonas comunes', NULL,                                   'area_comun', 'media',   48,  'copropiedad', 12),
  ('seguridad',        'Seguridad',          'Cámaras, portería y alarmas.',            'area_comun', 'alta',    24,  'copropiedad', 13),
  ('otro',             'Otro',               NULL,                                      'ambos',      'media',   72,  'por_definir', 99);

UPDATE tipos_incidencia i
  JOIN tipos_movimiento m ON m.codigo = 'mantenimiento'
  SET i.tipo_movimiento_id = m.id
  WHERE i.ambito IN ('unidad','ambos') AND i.tipo_movimiento_id IS NULL;

UPDATE tipos_incidencia i
  JOIN tipos_movimiento m ON m.codigo = 'zonas_comunes'
  SET i.tipo_movimiento_id = m.id
  WHERE i.ambito = 'area_comun' AND i.tipo_movimiento_id IS NULL;

-- ---------------------------------------------------------------------------
-- Tipos de documento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_documento (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo         VARCHAR(40) NOT NULL,
  nombre         VARCHAR(120) NOT NULL,
  descripcion    VARCHAR(255) NULL,
  -- Un certificado laboral de hace ocho meses no dice nada del presente. NULL
  -- es un documento que no caduca, como la cédula.
  vigencia_dias  SMALLINT UNSIGNED NULL,
  formatos       VARCHAR(120) NOT NULL DEFAULT 'pdf,jpg,png',
  tamano_max_mb  TINYINT UNSIGNED NOT NULL DEFAULT 10,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  orden          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_tipodoc_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO tipos_documento (codigo, nombre, descripcion, vigencia_dias, orden) VALUES
  ('documento_identidad',  'Documento de identidad', 'Cédula por ambas caras.',                        NULL, 1),
  ('certificado_laboral',  'Certificado laboral',    'Con cargo, salario y antigüedad.',                90, 2),
  ('desprendibles_nomina', 'Desprendibles de nómina','Los tres últimos.',                               90, 3),
  ('extractos_bancarios',  'Extractos bancarios',    'Los tres últimos meses.',                         90, 4),
  ('declaracion_renta',    'Declaración de renta',   'La del último año gravable.',                    400, 5),
  ('rut',                  'RUT',                    'Para independientes y empresas.',                365, 6),
  ('camara_comercio',      'Cámara de comercio',     'Certificado de existencia y representación.',     30, 7),
  ('estados_financieros',  'Estados financieros',    'Para independientes con contador.',              400, 8),
  ('certificado_pension',  'Certificado de pensión', 'Resolución o desprendible de mesada.',            90, 9),
  ('carta_universidad',    'Certificado de estudio', 'Para estudiantes.',                              180, 10),
  ('referencia_personal',  'Referencia personal',    NULL,                                             180, 11),
  ('referencia_comercial', 'Referencia comercial',   NULL,                                             180, 12),
  ('certificado_libertad', 'Certificado de libertad y tradición', 'Del inmueble, para el propietario.', 30, 13),
  ('poliza_arrendamiento', 'Póliza de arrendamiento', NULL,                                            365, 14),
  ('otro',                 'Otro',                   NULL,                                             NULL, 99);

-- ---------------------------------------------------------------------------
-- Requisitos y los documentos que los soportan
-- ---------------------------------------------------------------------------
-- Un requisito es lo que hay que demostrar; un documento es con qué se
-- demuestra. La distinción importa porque casi nunca hay un solo camino:
-- «demostrar ingresos» lo resuelve un certificado laboral, o tres extractos, o
-- una declaración de renta, según de qué viva la persona. Pedir siempre los
-- tres es lo que hace que arrendar sea un trámite.
CREATE TABLE IF NOT EXISTS requisitos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(40) NOT NULL,
  nombre      VARCHAR(160) NOT NULL,
  descripcion VARCHAR(500) NULL,
  aplica_a    ENUM('inquilino','codeudor','propietario','proveedor') NOT NULL,
  -- 'cualquiera': con uno de los documentos asociados alcanza.
  -- 'todos': hacen falta todos.
  modo        ENUM('cualquiera','todos') NOT NULL DEFAULT 'cualquiera',
  obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  orden       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_requisito_codigo (codigo),
  KEY ix_requisito_aplica (aplica_a, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS requisito_documentos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requisito_id       INT UNSIGNED NOT NULL,
  tipo_documento_id  INT UNSIGNED NOT NULL,
  nota               VARCHAR(255) NULL,
  orden              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_reqdoc (requisito_id, tipo_documento_id),
  CONSTRAINT fk_reqdoc_requisito FOREIGN KEY (requisito_id)
    REFERENCES requisitos(id) ON DELETE CASCADE,
  CONSTRAINT fk_reqdoc_tipodoc FOREIGN KEY (tipo_documento_id)
    REFERENCES tipos_documento(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO requisitos (codigo, nombre, descripcion, aplica_a, modo, obligatorio, orden) VALUES
  ('identidad',        'Identidad',
   'Confirmar que la persona es quien dice ser.', 'inquilino', 'todos', TRUE, 1),
  ('ingresos',         'Ingresos demostrables',
   'Cualquiera de estos sirve: depende de si es empleado, independiente o pensionado.',
   'inquilino', 'cualquiera', TRUE, 2),
  ('actividad',        'Actividad económica',
   'Con qué se gana la vida.', 'inquilino', 'cualquiera', FALSE, 3),
  ('referencias',      'Referencias',
   'Personales o comerciales.', 'inquilino', 'cualquiera', FALSE, 4),
  ('identidad_codeudor','Identidad del codeudor', NULL, 'codeudor', 'todos', TRUE, 1),
  ('ingresos_codeudor', 'Ingresos del codeudor',
   'Se suman a los del inquilino en la precalificación.', 'codeudor', 'cualquiera', TRUE, 2),
  ('titularidad',      'Titularidad del inmueble',
   'Que quien arrienda sea el dueño.', 'propietario', 'todos', TRUE, 1),
  ('existencia_proveedor', 'Existencia y representación',
   'Para proveedores constituidos como empresa.', 'proveedor', 'todos', TRUE, 1);

INSERT IGNORE INTO requisito_documentos (requisito_id, tipo_documento_id, orden)
SELECT r.id, d.id, v.orden FROM requisitos r JOIN tipos_documento d JOIN (
  SELECT 'identidad' AS req, 'documento_identidad' AS doc, 1 AS orden UNION ALL
  SELECT 'ingresos', 'certificado_laboral', 1 UNION ALL
  SELECT 'ingresos', 'desprendibles_nomina', 2 UNION ALL
  SELECT 'ingresos', 'extractos_bancarios', 3 UNION ALL
  SELECT 'ingresos', 'declaracion_renta', 4 UNION ALL
  SELECT 'ingresos', 'certificado_pension', 5 UNION ALL
  SELECT 'ingresos', 'estados_financieros', 6 UNION ALL
  SELECT 'actividad', 'certificado_laboral', 1 UNION ALL
  SELECT 'actividad', 'rut', 2 UNION ALL
  SELECT 'actividad', 'camara_comercio', 3 UNION ALL
  SELECT 'actividad', 'carta_universidad', 4 UNION ALL
  SELECT 'referencias', 'referencia_personal', 1 UNION ALL
  SELECT 'referencias', 'referencia_comercial', 2 UNION ALL
  SELECT 'identidad_codeudor', 'documento_identidad', 1 UNION ALL
  SELECT 'ingresos_codeudor', 'certificado_laboral', 1 UNION ALL
  SELECT 'ingresos_codeudor', 'extractos_bancarios', 2 UNION ALL
  SELECT 'ingresos_codeudor', 'declaracion_renta', 3 UNION ALL
  SELECT 'titularidad', 'certificado_libertad', 1 UNION ALL
  SELECT 'existencia_proveedor', 'camara_comercio', 1 UNION ALL
  SELECT 'existencia_proveedor', 'rut', 2
) v ON v.req = r.codigo AND v.doc = d.codigo;
