-- 012 · Las tablas que configuran el sistema: geografía, tipos de inmueble y
-- parámetros generales. Son datos de referencia, no de ejemplo: la aplicación
-- no funciona sin ellos y se editan desde la administración, nunca con una
-- migración nueva.
--
-- Los INSERT son INSERT IGNORE: crean lo que falta y jamás pisan lo existente.
-- Corregir el nombre de una ciudad es un UPDATE desde la pantalla de admin.

-- ---------------------------------------------------------------------------
-- Geografía
-- ---------------------------------------------------------------------------
-- Hasta ahora ciudad y departamento eran texto libre en `inmuebles`, así que
-- «Bogotá», «bogota» y «Bogotá D.C.» eran tres ciudades distintas y ninguna
-- búsqueda por ciudad podía ser confiable. Estas tablas les dan una identidad.

CREATE TABLE IF NOT EXISTS paises (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo_iso2      CHAR(2) NOT NULL,
  codigo_iso3      CHAR(3) NOT NULL,
  nombre           VARCHAR(120) NOT NULL,
  prefijo_telefono VARCHAR(6) NULL,
  moneda           CHAR(3) NOT NULL DEFAULT 'COP',
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  orden            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_paises_iso2 (codigo_iso2),
  UNIQUE KEY uk_paises_iso3 (codigo_iso3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS departamentos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pais_id     INT UNSIGNED NOT NULL,
  -- Código DANE de dos dígitos. Es la llave con la que se cruza cualquier dato
  -- oficial colombiano, por eso se guarda aunque el id sea autoincremental.
  codigo_dane CHAR(2) NULL,
  nombre      VARCHAR(120) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  orden       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_depto_pais_nombre (pais_id, nombre),
  KEY ix_depto_dane (codigo_dane),
  CONSTRAINT fk_depto_pais FOREIGN KEY (pais_id) REFERENCES paises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ciudades (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  departamento_id INT UNSIGNED NOT NULL,
  -- DANE de municipio: cinco dígitos, los dos primeros son el departamento.
  codigo_dane     CHAR(5) NULL,
  nombre          VARCHAR(120) NOT NULL,
  es_capital      BOOLEAN NOT NULL DEFAULT FALSE,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_ciudad_depto_nombre (departamento_id, nombre),
  KEY ix_ciudad_dane (codigo_dane),
  KEY ix_ciudad_nombre (nombre),
  CONSTRAINT fk_ciudad_depto FOREIGN KEY (departamento_id) REFERENCES departamentos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS barrios (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ciudad_id  INT UNSIGNED NOT NULL,
  nombre     VARCHAR(120) NOT NULL,
  -- En Bogotá y Medellín el barrio cuelga de una localidad o comuna. Es texto
  -- y no otra tabla porque cada ciudad nombra ese nivel distinto y no hay una
  -- jerarquía nacional que valga la pena imponer.
  localidad  VARCHAR(120) NULL,
  estrato    TINYINT UNSIGNED NULL,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_barrio_ciudad_nombre (ciudad_id, nombre),
  KEY ix_barrio_nombre (nombre),
  CONSTRAINT fk_barrio_ciudad FOREIGN KEY (ciudad_id) REFERENCES ciudades(id) ON DELETE CASCADE,
  CONSTRAINT ck_barrio_estrato CHECK (estrato IS NULL OR estrato BETWEEN 1 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Tipos de inmueble
-- ---------------------------------------------------------------------------
-- `inmuebles.tipo` sigue siendo un ENUM: es la restricción de integridad y no
-- se toca acá. Esta tabla es lo configurable alrededor de cada tipo — cómo se
-- llama, si se ofrece, en qué orden aparece y qué marco legal le corresponde.
--
-- Consecuencia que hay que tener presente: activar o renombrar un tipo se hace
-- desde la administración, pero inventar un tipo nuevo sigue necesitando una
-- migración que amplíe el ENUM. Es a propósito: el marco legal de un tipo que
-- nadie modeló no lo puede resolver un formulario.
CREATE TABLE IF NOT EXISTS tipos_inmueble (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo               VARCHAR(40) NOT NULL,
  nombre               VARCHAR(120) NOT NULL,
  plural               VARCHAR(120) NOT NULL,
  -- Decide qué reglas aplican al contrato. Vivienda urbana es la Ley 820 de
  -- 2003, que prohíbe el depósito en dinero y limita el incremento al IPC.
  -- Los mismos valores que `contratos.marco_legal`: si un tipo pudiera apuntar
  -- a un marco que el contrato no conoce, la unidad no se podría arrendar.
  marco_legal          ENUM('vivienda_urbana','comercial','habitacion','parqueadero','mixto') NOT NULL,
  es_residencial       BOOLEAN NOT NULL DEFAULT TRUE,
  pide_habitaciones    BOOLEAN NOT NULL DEFAULT TRUE,
  pide_banos           BOOLEAN NOT NULL DEFAULT TRUE,
  pide_area            BOOLEAN NOT NULL DEFAULT TRUE,
  admite_mascotas      BOOLEAN NOT NULL DEFAULT TRUE,
  icono                VARCHAR(40) NULL,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  orden                SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_tipoinm_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Parámetros generales
-- ---------------------------------------------------------------------------
-- Los números que hoy están escritos dentro del código y que un administrador
-- tiene que poder cambiar sin un despliegue: tasas, plazos, topes.
--
-- `valor` es texto y `tipo` dice cómo leerlo. Una tabla por parámetro sería
-- más estricta pero cada parámetro nuevo pediría una migración, que es
-- justamente lo que esta tabla existe para evitar.
CREATE TABLE IF NOT EXISTS parametros (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clave       VARCHAR(80) NOT NULL,
  valor       VARCHAR(500) NOT NULL,
  tipo        ENUM('texto','entero','decimal','booleano','json') NOT NULL DEFAULT 'texto',
  categoria   VARCHAR(60) NOT NULL DEFAULT 'general',
  nombre      VARCHAR(160) NOT NULL,
  descripcion VARCHAR(500) NULL,
  unidad      VARCHAR(20) NULL,
  -- Un parámetro de sistema se puede leer pero no editar desde la pantalla:
  -- cambiarlo rompería supuestos del código, no solo una política comercial.
  editable    BOOLEAN NOT NULL DEFAULT TRUE,
  orden       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_parametros_clave (clave),
  KEY ix_parametros_categoria (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Semillas
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO paises (codigo_iso2, codigo_iso3, nombre, prefijo_telefono, moneda, activo, orden) VALUES
  ('CO', 'COL', 'Colombia', '+57', 'COP', TRUE, 1);

-- Los 32 departamentos más Bogotá D.C., con su código DANE. Bogotá va como una
-- entrada aparte porque es distrito capital: no pertenece a Cundinamarca para
-- efectos administrativos, aunque geográficamente esté adentro.
INSERT IGNORE INTO departamentos (pais_id, codigo_dane, nombre, orden)
SELECT p.id, d.codigo, d.nombre, d.orden FROM paises p JOIN (
  SELECT '11' AS codigo, 'Bogotá D.C.' AS nombre, 1 AS orden UNION ALL
  SELECT '05', 'Antioquia', 2 UNION ALL
  SELECT '76', 'Valle del Cauca', 3 UNION ALL
  SELECT '08', 'Atlántico', 4 UNION ALL
  SELECT '68', 'Santander', 5 UNION ALL
  SELECT '25', 'Cundinamarca', 6 UNION ALL
  SELECT '13', 'Bolívar', 7 UNION ALL
  SELECT '15', 'Boyacá', 8 UNION ALL
  SELECT '17', 'Caldas', 9 UNION ALL
  SELECT '18', 'Caquetá', 10 UNION ALL
  SELECT '19', 'Cauca', 11 UNION ALL
  SELECT '20', 'Cesar', 12 UNION ALL
  SELECT '23', 'Córdoba', 13 UNION ALL
  SELECT '27', 'Chocó', 14 UNION ALL
  SELECT '41', 'Huila', 15 UNION ALL
  SELECT '44', 'La Guajira', 16 UNION ALL
  SELECT '47', 'Magdalena', 17 UNION ALL
  SELECT '50', 'Meta', 18 UNION ALL
  SELECT '52', 'Nariño', 19 UNION ALL
  SELECT '54', 'Norte de Santander', 20 UNION ALL
  SELECT '63', 'Quindío', 21 UNION ALL
  SELECT '66', 'Risaralda', 22 UNION ALL
  SELECT '70', 'Sucre', 23 UNION ALL
  SELECT '73', 'Tolima', 24 UNION ALL
  SELECT '81', 'Arauca', 25 UNION ALL
  SELECT '85', 'Casanare', 26 UNION ALL
  SELECT '86', 'Putumayo', 27 UNION ALL
  SELECT '88', 'San Andrés y Providencia', 28 UNION ALL
  SELECT '91', 'Amazonas', 29 UNION ALL
  SELECT '94', 'Guainía', 30 UNION ALL
  SELECT '95', 'Guaviare', 31 UNION ALL
  SELECT '97', 'Vaupés', 32 UNION ALL
  SELECT '99', 'Vichada', 33
) d WHERE p.codigo_iso2 = 'CO';

-- Capitales y los municipios donde hay mercado de arriendo de verdad. No es el
-- listado completo de los 1.100 municipios: el resto se agrega desde la
-- administración cuando aparezca una unidad que lo necesite.
INSERT IGNORE INTO ciudades (departamento_id, codigo_dane, nombre, es_capital, orden)
SELECT dep.id, c.codigo, c.nombre, c.capital, c.orden FROM departamentos dep JOIN (
  SELECT '11001' AS codigo, 'Bogotá D.C.' AS nombre, TRUE AS capital, 1 AS orden UNION ALL
  SELECT '05001', 'Medellín', TRUE, 1 UNION ALL
  SELECT '05088', 'Bello', FALSE, 2 UNION ALL
  SELECT '05266', 'Envigado', FALSE, 3 UNION ALL
  SELECT '05360', 'Itagüí', FALSE, 4 UNION ALL
  SELECT '05631', 'Sabaneta', FALSE, 5 UNION ALL
  SELECT '05380', 'La Estrella', FALSE, 6 UNION ALL
  SELECT '05129', 'Caldas', FALSE, 7 UNION ALL
  SELECT '05308', 'Girardota', FALSE, 8 UNION ALL
  SELECT '05615', 'Rionegro', FALSE, 9 UNION ALL
  SELECT '76001', 'Cali', TRUE, 1 UNION ALL
  SELECT '76892', 'Yumbo', FALSE, 2 UNION ALL
  SELECT '76364', 'Jamundí', FALSE, 3 UNION ALL
  SELECT '76520', 'Palmira', FALSE, 4 UNION ALL
  SELECT '76109', 'Buenaventura', FALSE, 5 UNION ALL
  SELECT '08001', 'Barranquilla', TRUE, 1 UNION ALL
  SELECT '08758', 'Soledad', FALSE, 2 UNION ALL
  SELECT '08573', 'Puerto Colombia', FALSE, 3 UNION ALL
  SELECT '08433', 'Malambo', FALSE, 4 UNION ALL
  SELECT '68001', 'Bucaramanga', TRUE, 1 UNION ALL
  SELECT '68276', 'Floridablanca', FALSE, 2 UNION ALL
  SELECT '68307', 'Girón', FALSE, 3 UNION ALL
  SELECT '68547', 'Piedecuesta', FALSE, 4 UNION ALL
  SELECT '25754', 'Soacha', FALSE, 1 UNION ALL
  SELECT '25175', 'Chía', FALSE, 2 UNION ALL
  SELECT '25899', 'Zipaquirá', FALSE, 3 UNION ALL
  SELECT '25473', 'Mosquera', FALSE, 4 UNION ALL
  SELECT '25286', 'Funza', FALSE, 5 UNION ALL
  SELECT '25430', 'Madrid', FALSE, 6 UNION ALL
  SELECT '25269', 'Facatativá', FALSE, 7 UNION ALL
  SELECT '25126', 'Cajicá', FALSE, 8 UNION ALL
  SELECT '25377', 'La Calera', FALSE, 9 UNION ALL
  SELECT '13001', 'Cartagena', TRUE, 1 UNION ALL
  SELECT '13430', 'Magangué', FALSE, 2 UNION ALL
  SELECT '15001', 'Tunja', TRUE, 1 UNION ALL
  SELECT '15759', 'Sogamoso', FALSE, 2 UNION ALL
  SELECT '15238', 'Duitama', FALSE, 3 UNION ALL
  SELECT '17001', 'Manizales', TRUE, 1 UNION ALL
  SELECT '17873', 'Villamaría', FALSE, 2 UNION ALL
  SELECT '18001', 'Florencia', TRUE, 1 UNION ALL
  SELECT '19001', 'Popayán', TRUE, 1 UNION ALL
  SELECT '20001', 'Valledupar', TRUE, 1 UNION ALL
  SELECT '23001', 'Montería', TRUE, 1 UNION ALL
  SELECT '27001', 'Quibdó', TRUE, 1 UNION ALL
  SELECT '41001', 'Neiva', TRUE, 1 UNION ALL
  SELECT '44001', 'Riohacha', TRUE, 1 UNION ALL
  SELECT '47001', 'Santa Marta', TRUE, 1 UNION ALL
  SELECT '50001', 'Villavicencio', TRUE, 1 UNION ALL
  SELECT '52001', 'Pasto', TRUE, 1 UNION ALL
  SELECT '52356', 'Ipiales', FALSE, 2 UNION ALL
  SELECT '54001', 'Cúcuta', TRUE, 1 UNION ALL
  SELECT '54874', 'Villa del Rosario', FALSE, 2 UNION ALL
  SELECT '63001', 'Armenia', TRUE, 1 UNION ALL
  SELECT '66001', 'Pereira', TRUE, 1 UNION ALL
  SELECT '66170', 'Dosquebradas', FALSE, 2 UNION ALL
  SELECT '70001', 'Sincelejo', TRUE, 1 UNION ALL
  SELECT '73001', 'Ibagué', TRUE, 1 UNION ALL
  SELECT '81001', 'Arauca', TRUE, 1 UNION ALL
  SELECT '85001', 'Yopal', TRUE, 1 UNION ALL
  SELECT '86001', 'Mocoa', TRUE, 1 UNION ALL
  SELECT '88001', 'San Andrés', TRUE, 1 UNION ALL
  SELECT '91001', 'Leticia', TRUE, 1 UNION ALL
  SELECT '94001', 'Inírida', TRUE, 1 UNION ALL
  SELECT '95001', 'San José del Guaviare', TRUE, 1 UNION ALL
  SELECT '97001', 'Mitú', TRUE, 1 UNION ALL
  SELECT '99001', 'Puerto Carreño', TRUE, 1
) c ON LEFT(c.codigo, 2) = dep.codigo_dane;

-- Los ocho tipos que hoy admite el ENUM de `inmuebles.tipo`. El marco legal de
-- cada uno es el que ya aplica `contratos.marcoLegalDe`; acá queda como dato
-- consultable en vez de escondido en una función.
INSERT IGNORE INTO tipos_inmueble
  (codigo, nombre, plural, marco_legal, es_residencial, pide_habitaciones, pide_banos, pide_area, admite_mascotas, orden) VALUES
  ('apartamento',  'Apartamento',     'Apartamentos',      'vivienda_urbana', TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  1),
  ('casa',         'Casa',            'Casas',             'vivienda_urbana', TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  2),
  ('habitacion',   'Habitación',      'Habitaciones',      'habitacion',      TRUE,  FALSE, TRUE,  TRUE,  TRUE,  3),
  ('local',        'Local comercial', 'Locales',           'comercial',       FALSE, FALSE, TRUE,  TRUE,  FALSE, 4),
  ('oficina',      'Oficina',         'Oficinas',          'comercial',       FALSE, FALSE, TRUE,  TRUE,  FALSE, 5),
  ('bodega',       'Bodega',          'Bodegas',           'comercial',       FALSE, FALSE, TRUE,  TRUE,  FALSE, 6),
  ('parqueadero',  'Parqueadero',     'Parqueaderos',      'parqueadero',     FALSE, FALSE, FALSE, FALSE, FALSE, 7),
  ('lote',         'Lote',            'Lotes',             'comercial',       FALSE, FALSE, FALSE, TRUE,  FALSE, 8);

-- Los valores que hoy viven dentro del código. Las tasas tributarias quedan
-- marcadas para revisión contable: son las vigentes en Colombia a 2026, pero
-- ninguna decisión de facturación debería apoyarse en ellas sin confirmarlas.
INSERT IGNORE INTO parametros (clave, valor, tipo, categoria, nombre, descripcion, unidad, editable, orden) VALUES
  ('moneda_default', 'COP', 'texto', 'general', 'Moneda',
   'Moneda en la que se expresan cánones y facturas.', NULL, FALSE, 1),
  ('pais_default', 'CO', 'texto', 'general', 'País de operación',
   'Determina la geografía que se ofrece al registrar una unidad.', NULL, TRUE, 2),
  ('iva_porcentaje', '19.00', 'decimal', 'tributario', 'IVA',
   'Aplica a los servicios de Yalqui, nunca al canon de arrendamiento de vivienda.', '%', TRUE, 10),
  ('retefuente_servicios_porcentaje', '4.00', 'decimal', 'tributario', 'Retención en la fuente por servicios',
   'PENDIENTE DE CONFIRMAR con el contador antes de facturar.', '%', TRUE, 11),
  ('dias_gracia_pago', '5', 'entero', 'cobranza', 'Días de gracia',
   'Días después del vencimiento antes de marcar una factura en mora.', 'días', TRUE, 20),
  ('interes_mora_mensual', '1.50', 'decimal', 'cobranza', 'Interés de mora mensual',
   'Tope legal: no puede superar 1,5 veces el interés bancario corriente certificado.', '%', TRUE, 21),
  ('canon_ingreso_maximo_porcentaje', '50.00', 'decimal', 'precalificacion', 'Canon máximo sobre ingresos',
   'Un canon que supere esta fracción del ingreso demostrable no precalifica.', '%', TRUE, 30),
  ('score_minimo_preaprobado', '60.00', 'decimal', 'precalificacion', 'Score mínimo para preaprobar',
   'Por debajo de este puntaje la solicitud queda en revisión manual.', 'puntos', TRUE, 31),
  ('vigencia_link_horas', '72', 'entero', 'precalificacion', 'Vigencia de los enlaces',
   'Horas que dura el enlace de precalificación o de firma antes de vencerse.', 'horas', TRUE, 32),
  ('incremento_maximo_vivienda', 'ipc', 'texto', 'contrato', 'Tope de incremento en vivienda',
   'La Ley 820 de 2003 limita el incremento anual al IPC del año anterior.', NULL, FALSE, 40),
  ('meses_deposito_vivienda', '0', 'entero', 'contrato', 'Depósito permitido en vivienda',
   'Cero: la Ley 820 prohíbe el depósito en dinero para vivienda urbana.', 'meses', FALSE, 41);
