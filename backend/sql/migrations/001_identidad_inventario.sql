-- 001 · Identidad, edificaciones, unidades y estructura del canon.
-- Fase 1. Sin dependencias externas.

CREATE TABLE IF NOT EXISTS usuarios (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email                VARCHAR(191) NOT NULL,
  password_hash        VARCHAR(191) NOT NULL,
  nombre               VARCHAR(120) NOT NULL,
  apellido             VARCHAR(120) NOT NULL,
  telefono             VARCHAR(30)  NULL,
  tipo_documento       ENUM('CC','CE','NIT','PA') NOT NULL,
  numero_documento     VARCHAR(40)  NOT NULL,
  estado               ENUM('pendiente','activo','suspendido') NOT NULL DEFAULT 'pendiente',
  email_verificado_at  TIMESTAMP NULL,
  telefono_verificado_at TIMESTAMP NULL,
  ultimo_acceso_at     TIMESTAMP NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuarios_email (email),
  UNIQUE KEY uk_usuarios_documento (tipo_documento, numero_documento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El ámbito hace que «es propietario» signifique algo: propietario ¿de qué?
-- ambito_id = 0 para los globales, porque MySQL no aplica unicidad sobre NULL.
CREATE TABLE IF NOT EXISTS usuario_roles (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL,
  rol           ENUM('admin_yalqui','administrador_inmueble','propietario',
                     'socio_propietario','inquilino','personal_propiedad','proveedor') NOT NULL,
  ambito_tipo   ENUM('global','inmueble','edificacion','contrato') NOT NULL,
  ambito_id     INT UNSIGNED NOT NULL DEFAULT 0,
  otorgado_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  otorgado_por_id INT UNSIGNED NULL,
  revocado_at   TIMESTAMP NULL,
  UNIQUE KEY uk_usuario_rol_ambito (usuario_id, rol, ambito_tipo, ambito_id),
  KEY ix_roles_ambito (ambito_tipo, ambito_id),
  CONSTRAINT fk_roles_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_roles_otorgante FOREIGN KEY (otorgado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS perfiles_propietario (
  usuario_id           INT UNSIGNED PRIMARY KEY,
  tipo_persona         ENUM('natural','juridica') NOT NULL DEFAULT 'natural',
  razon_social         VARCHAR(191) NULL,
  nit                  VARCHAR(30)  NULL,
  digito_verificacion  CHAR(1)      NULL,
  responsable_iva      BOOLEAN NOT NULL DEFAULT FALSE,
  banco                VARCHAR(80)  NULL,
  tipo_cuenta          ENUM('ahorros','corriente') NULL,
  cuenta_token         VARCHAR(191) NULL,
  cuenta_enmascarada   VARCHAR(30)  NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_perfil_prop_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sin columna edad: se guarda la fecha y la edad se calcula.
-- Estos datos describen y emparejan; nunca entran al historial de cumplimiento.
CREATE TABLE IF NOT EXISTS perfiles_inquilino (
  usuario_id             INT UNSIGNED PRIMARY KEY,
  fecha_nacimiento       DATE NULL,
  genero                 ENUM('femenino','masculino','no_binario','otro','prefiere_no_decir') NULL,
  tipo_vinculacion       ENUM('asalariado','independiente','estudiante','pensionado','desempleado','otro') NULL,
  profesion              VARCHAR(120) NULL,
  nivel_educativo        ENUM('primaria','bachillerato','tecnico','universitario','posgrado','otro') NULL,
  empresa                VARCHAR(191) NULL,
  antiguedad_laboral_meses SMALLINT UNSIGNED NULL,
  rango_ingresos         ENUM('menos_2_smmlv','2_4_smmlv','4_6_smmlv','6_10_smmlv','mas_10_smmlv') NULL,
  ingresos_mensuales     DECIMAL(14,2) NULL,
  dia_preferido_pago     TINYINT UNSIGNED NULL,
  num_ocupantes_habitual TINYINT UNSIGNED NULL,
  num_mascotas           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  mascotas               JSON NULL,
  fumador                BOOLEAN NULL,
  biografia              TEXT NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_perfil_inq_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT ck_perfil_inq_dia_pago CHECK (dia_preferido_pago IS NULL OR dia_preferido_pago BETWEEN 1 AND 31)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Append-only: revocar no borra, inserta una fila nueva.
CREATE TABLE IF NOT EXISTS consentimientos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT UNSIGNED NOT NULL,
  tipo            ENUM('tratamiento_datos','compartir_score','consulta_centrales',
                       'consulta_antecedentes','comunicaciones') NOT NULL,
  otorgado        BOOLEAN NOT NULL,
  version_politica VARCHAR(20) NOT NULL,
  alcance         JSON NULL,
  otorgado_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revocado_at     TIMESTAMP NULL,
  ip              VARCHAR(45) NULL,
  user_agent      VARCHAR(255) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_consent_usuario_tipo (usuario_id, tipo, otorgado_at),
  CONSTRAINT fk_consent_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS archivos (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid           CHAR(36) NOT NULL,
  s3_key         VARCHAR(500) NOT NULL,
  bucket         VARCHAR(120) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  mime           VARCHAR(120) NOT NULL,
  tamano_bytes   BIGINT UNSIGNED NOT NULL,
  subido_por_id  INT UNSIGNED NULL,
  entidad_tipo   VARCHAR(60) NULL,
  entidad_id     BIGINT UNSIGNED NULL,
  publico        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_archivos_uuid (uuid),
  KEY ix_archivos_entidad (entidad_tipo, entidad_id),
  CONSTRAINT fk_archivos_usuario FOREIGN KEY (subido_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- regimen distingue copropiedad de propiedad única: define de quién son las
-- zonas comunes y quién tiene autoridad sin otorgamiento manual.
CREATE TABLE IF NOT EXISTS edificaciones (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre               VARCHAR(191) NOT NULL,
  tipo                 ENUM('edificio','conjunto','casa_dividida','zona') NOT NULL,
  regimen              ENUM('copropiedad','propiedad_unica','informal') NOT NULL,
  propietario_id       INT UNSIGNED NULL,
  direccion            VARCHAR(255) NOT NULL,
  barrio               VARCHAR(120) NULL,
  ciudad               VARCHAR(120) NOT NULL,
  latitud              DECIMAL(10,7) NULL,
  longitud             DECIMAL(10,7) NULL,
  num_unidades         SMALLINT UNSIGNED NULL,
  area_comun_m2        DECIMAL(10,2) NULL,
  administracion_nombre   VARCHAR(191) NULL,
  administracion_telefono VARCHAR(30)  NULL,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_edif_ciudad (ciudad, activo),
  CONSTRAINT fk_edif_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La unidad arrendable. propietario_id es el PRINCIPAL; los socios van aparte.
-- edificacion_id es nulo a propósito: una unidad suelta es de primera clase.
CREATE TABLE IF NOT EXISTS inmuebles (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                  CHAR(36) NOT NULL,
  codigo_publico        VARCHAR(20) NOT NULL,
  propietario_id        INT UNSIGNED NOT NULL,
  edificacion_id        INT UNSIGNED NULL,
  tipo                  ENUM('apartamento','casa','local','oficina','habitacion',
                             'parqueadero','bodega','lote') NOT NULL,
  estado                ENUM('borrador','publicado','pausado','reservado','arrendado','archivado')
                        NOT NULL DEFAULT 'borrador',
  direccion             VARCHAR(255) NOT NULL,
  complemento           VARCHAR(120) NULL,
  barrio                VARCHAR(120) NULL,
  ciudad                VARCHAR(120) NOT NULL,
  departamento          VARCHAR(120) NOT NULL,
  latitud               DECIMAL(10,7) NULL,
  longitud              DECIMAL(10,7) NULL,
  estrato               TINYINT UNSIGNED NULL,
  area_construida_m2    DECIMAL(10,2) NULL,
  area_privada_m2       DECIMAL(10,2) NULL,
  habitaciones          TINYINT UNSIGNED NULL,
  banos                 TINYINT UNSIGNED NULL,
  parqueaderos          TINYINT UNSIGNED NULL,
  ocupantes_base        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  ocupantes_maximo      TINYINT UNSIGNED NULL,
  mascotas_maximo       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  mascotas_tipos_admitidos JSON NULL,
  piso                  TINYINT UNSIGNED NULL,
  anio_construccion     SMALLINT UNSIGNED NULL,
  amoblado              BOOLEAN NOT NULL DEFAULT FALSE,
  administracion_incluida BOOLEAN NOT NULL DEFAULT FALSE,
  valor_administracion  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  canon_base            DECIMAL(14,2) NOT NULL,
  deposito              DECIMAL(14,2) NULL,
  tope_ingreso_pct      DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  servicios_publicos_incluidos ENUM('ninguno','algunos','todos') NOT NULL DEFAULT 'ninguno',
  matricula_inmobiliaria VARCHAR(60) NULL,
  chip_catastral        VARCHAR(60) NULL,
  descripcion           TEXT NULL,
  publicado_at          TIMESTAMP NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inmuebles_uuid (uuid),
  UNIQUE KEY uk_inmuebles_codigo (codigo_publico),
  KEY ix_inmuebles_propietario (propietario_id),
  KEY ix_inmuebles_ciudad_estado (ciudad, estado),
  KEY ix_inmuebles_busqueda (estado, tipo, canon_base),
  KEY ix_inmuebles_edificacion (edificacion_id),
  CONSTRAINT fk_inmuebles_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_inmuebles_edificacion FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE SET NULL,
  CONSTRAINT ck_inmuebles_canon CHECK (canon_base >= 0),
  CONSTRAINT ck_inmuebles_tope CHECK (tope_ingreso_pct > 0 AND tope_ingreso_pct <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Copropiedad. aparece_en_titulo decide a quién le exige firma el contrato.
-- La columna generada emula un único parcial, que MySQL no tiene.
CREATE TABLE IF NOT EXISTS inmueble_propietarios (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id        INT UNSIGNED NOT NULL,
  usuario_id         INT UNSIGNED NOT NULL,
  rol                ENUM('principal','socio') NOT NULL,
  porcentaje         DECIMAL(5,2) NOT NULL,
  aparece_en_titulo  BOOLEAN NOT NULL DEFAULT TRUE,
  puede_decidir      BOOLEAN NOT NULL DEFAULT FALSE,
  puede_ver_finanzas BOOLEAN NOT NULL DEFAULT TRUE,
  desde              DATE NOT NULL,
  hasta              DATE NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Estas dos emulan un índice único parcial, que MySQL no tiene. Van VIRTUAL
  -- y no STORED porque MySQL prohíbe ON DELETE CASCADE sobre la columna base
  -- de una generada STORED, y estas cuelgan de inmueble_id.
  vigente_uk         INT UNSIGNED AS (IF(hasta IS NULL, inmueble_id, NULL)) VIRTUAL,
  vigente_usuario_uk INT UNSIGNED AS (IF(hasta IS NULL, usuario_id, NULL)) VIRTUAL,
  UNIQUE KEY uk_inmprop_vigente (vigente_uk, vigente_usuario_uk),
  KEY ix_inmprop_usuario (usuario_id),
  CONSTRAINT fk_inmprop_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_inmprop_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT ck_inmprop_pct CHECK (porcentaje > 0 AND porcentaje <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS etiquetas (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ambito_tipo  ENUM('propietario','edificacion') NOT NULL,
  ambito_id    INT UNSIGNED NOT NULL,
  nombre       VARCHAR(60) NOT NULL,
  color        CHAR(7) NULL,
  orden        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  creada_por_id INT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_etiquetas_ambito_nombre (ambito_tipo, ambito_id, nombre),
  KEY ix_etiquetas_orden (ambito_tipo, ambito_id, orden),
  CONSTRAINT fk_etiquetas_creador FOREIGN KEY (creada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- es_principal define en qué grupo cae la unidad al agrupar.
-- Sin eso, una unidad con dos etiquetas aparece dos veces y los totales mienten.
CREATE TABLE IF NOT EXISTS inmueble_etiquetas (
  inmueble_id     INT UNSIGNED NOT NULL,
  etiqueta_id     INT UNSIGNED NOT NULL,
  es_principal    BOOLEAN NOT NULL DEFAULT FALSE,
  asignada_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  asignada_por_id INT UNSIGNED NULL,
  principal_uk    INT UNSIGNED AS (IF(es_principal, inmueble_id, NULL)) VIRTUAL,
  PRIMARY KEY (inmueble_id, etiqueta_id),
  UNIQUE KEY uk_inmetq_principal (principal_uk),
  KEY ix_inmetq_etiqueta (etiqueta_id),
  CONSTRAINT fk_inmetq_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_inmetq_etiqueta FOREIGN KEY (etiqueta_id) REFERENCES etiquetas(id) ON DELETE CASCADE,
  CONSTRAINT fk_inmetq_asignador FOREIGN KEY (asignada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inmueble_fotos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id     INT UNSIGNED NOT NULL,
  archivo_id      BIGINT UNSIGNED NOT NULL,
  orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  es_portada      BOOLEAN NOT NULL DEFAULT FALSE,
  descripcion     VARCHAR(255) NULL,
  ancho           SMALLINT UNSIGNED NULL,
  alto            SMALLINT UNSIGNED NULL,
  bytes           INT UNSIGNED NULL,
  hash_percep     CHAR(16) NULL,
  estado_revision ENUM('pendiente','apta','con_observaciones','rechazada') NOT NULL DEFAULT 'pendiente',
  observaciones   JSON NULL,
  revisada_at     TIMESTAMP NULL,
  portada_uk      INT UNSIGNED AS (IF(es_portada, inmueble_id, NULL)) VIRTUAL,
  UNIQUE KEY uk_fotos_portada (portada_uk),
  KEY ix_fotos_inmueble_orden (inmueble_id, orden),
  KEY ix_fotos_revision (inmueble_id, estado_revision),
  CONSTRAINT fk_fotos_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_fotos_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Catálogo administrado por Yalqui, para que los avisos sean comparables.
CREATE TABLE IF NOT EXISTS catalogo_ajustes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo           VARCHAR(40) NOT NULL,
  nombre           VARCHAR(120) NOT NULL,
  descripcion      VARCHAR(255) NULL,
  categoria        ENUM('comodidad','ocupacion','mascota','parqueadero','servicio','otro') NOT NULL,
  tipo_calculo     ENUM('monto_fijo','porcentaje','por_cantidad') NOT NULL,
  periodicidad     ENUM('mensual','unico') NOT NULL DEFAULT 'mensual',
  permite_cantidad BOOLEAN NOT NULL DEFAULT FALSE,
  aplica_a_tipos   JSON NULL,
  icono            VARCHAR(40) NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  orden            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_catajustes_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inmueble_ajustes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id     INT UNSIGNED NOT NULL,
  ajuste_id       INT UNSIGNED NOT NULL,
  disponible      BOOLEAN NOT NULL DEFAULT TRUE,
  valor           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  porcentaje      DECIMAL(6,3) NULL,
  cantidad_maxima TINYINT UNSIGNED NULL,
  obligatorio     BOOLEAN NOT NULL DEFAULT FALSE,
  nota            VARCHAR(255) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inmajuste (inmueble_id, ajuste_id),
  CONSTRAINT fk_inmajuste_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_inmajuste_catalogo FOREIGN KEY (ajuste_id) REFERENCES catalogo_ajustes(id) ON DELETE RESTRICT,
  CONSTRAINT ck_inmajuste_valor CHECK (valor >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
