-- 003 · Plantillas, contrato, ajustes pactados y firmas.
-- Fase 1. La firma es propia con OTP; el proveedor certificado queda como
-- columna para cuando se decida, sin implementar llamada alguna.

-- El molde del que sale cada contrato. marco_legal no es una etiqueta:
-- vivienda urbana y local comercial se rigen por leyes distintas.
CREATE TABLE IF NOT EXISTS plantillas_contrato (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo         VARCHAR(40) NOT NULL,
  nombre         VARCHAR(191) NOT NULL,
  marco_legal    ENUM('vivienda_urbana','comercial','habitacion','parqueadero','mixto') NOT NULL,
  aplica_a_tipos JSON NULL,
  cuerpo         MEDIUMTEXT NOT NULL,
  variables      JSON NULL,
  version        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  estado         ENUM('borrador','vigente','archivada') NOT NULL DEFAULT 'borrador',
  creada_por_id  INT UNSIGNED NULL,
  vigente_desde  DATE NULL,
  vigente_hasta  DATE NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_plantilla_codigo_version (codigo, version),
  KEY ix_plantilla_marco (marco_legal, estado),
  CONSTRAINT fk_plantilla_creador FOREIGN KEY (creada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- canon_mensual es solo la BASE: lo que paga el inquilino sale de sumarle los
-- contrato_ajustes vigentes del periodo. garantia_tipo reemplaza al depósito
-- suelto — en vivienda urbana el depósito en dinero está en revisión legal.
CREATE TABLE IF NOT EXISTS contratos (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                  CHAR(36) NOT NULL,
  numero                VARCHAR(30) NOT NULL,
  inmueble_id           INT UNSIGNED NOT NULL,
  propietario_id        INT UNSIGNED NOT NULL,
  inquilino_id          INT UNSIGNED NOT NULL,
  aplicacion_id         INT UNSIGNED NULL,
  contrato_anterior_id  INT UNSIGNED NULL,
  plantilla_id          INT UNSIGNED NOT NULL,
  plantilla_version     SMALLINT UNSIGNED NOT NULL,
  clausulas_opcionales  JSON NULL,
  estado                ENUM('borrador','pendiente_firma','vigente','en_mora','en_terminacion','terminado')
                        NOT NULL DEFAULT 'borrador',
  fecha_inicio          DATE NOT NULL,
  fecha_fin             DATE NOT NULL,
  meses_plazo           SMALLINT UNSIGNED NOT NULL,
  canon_mensual         DECIMAL(14,2) NOT NULL,
  valor_administracion  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  administracion_incluida BOOLEAN NOT NULL DEFAULT FALSE,
  dia_pago              TINYINT UNSIGNED NOT NULL,
  garantia_tipo         ENUM('codeudor','poliza','fiador','deposito','ninguna') NOT NULL DEFAULT 'ninguna',
  deposito              DECIMAL(14,2) NULL,
  regimen_iva           ENUM('excluido','gravado') NOT NULL DEFAULT 'excluido',
  tarifa_iva            DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  inquilino_agente_retenedor BOOLEAN NOT NULL DEFAULT FALSE,
  tarifa_retencion      DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  incremento_tipo       ENUM('ipc','ipc_mas_puntos','fijo','ninguno') NOT NULL DEFAULT 'ipc',
  incremento_valor      DECIMAL(5,2) NULL,
  prorroga_automatica   BOOLEAN NOT NULL DEFAULT TRUE,
  archivo_id            BIGINT UNSIGNED NULL,
  hash_documento        CHAR(64) NULL,
  firmado_at            TIMESTAMP NULL,
  terminado_at          TIMESTAMP NULL,
  motivo_terminacion    VARCHAR(500) NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_contratos_uuid (uuid),
  UNIQUE KEY uk_contratos_numero (numero),
  KEY ix_contratos_vencimiento (estado, fecha_fin),
  KEY ix_contratos_inmueble (inmueble_id),
  KEY ix_contratos_inquilino (inquilino_id),
  CONSTRAINT fk_contratos_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_contratos_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_contratos_inquilino FOREIGN KEY (inquilino_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_contratos_aplicacion FOREIGN KEY (aplicacion_id) REFERENCES aplicaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_contratos_anterior FOREIGN KEY (contrato_anterior_id) REFERENCES contratos(id) ON DELETE SET NULL,
  CONSTRAINT fk_contratos_plantilla FOREIGN KEY (plantilla_id) REFERENCES plantillas_contrato(id) ON DELETE RESTRICT,
  CONSTRAINT fk_contratos_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE SET NULL,
  CONSTRAINT ck_contratos_dia_pago CHECK (dia_pago BETWEEN 1 AND 31),
  CONSTRAINT ck_contratos_canon CHECK (canon_mensual >= 0),
  CONSTRAINT ck_contratos_fechas CHECK (fecha_fin > fecha_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- valor_unitario se congela al firmar: si el propietario sube el precio del
-- parqueadero, los contratos vigentes no se mueven. Las vigencias permiten que
-- un ajuste entre o salga a mitad de contrato sin renegociar el canon.
CREATE TABLE IF NOT EXISTS contrato_ajustes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contrato_id    INT UNSIGNED NOT NULL,
  ajuste_id      INT UNSIGNED NOT NULL,
  cantidad       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  valor_unitario DECIMAL(14,2) NOT NULL,
  valor_total    DECIMAL(14,2) NOT NULL,
  periodicidad   ENUM('mensual','unico') NOT NULL DEFAULT 'mensual',
  vigente_desde  DATE NOT NULL,
  vigente_hasta  DATE NULL,
  nota           VARCHAR(255) NULL,
  KEY ix_contajuste_contrato (contrato_id, vigente_desde),
  KEY ix_contajuste_ajuste (ajuste_id),
  CONSTRAINT fk_contajuste_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE,
  CONSTRAINT fk_contajuste_catalogo FOREIGN KEY (ajuste_id) REFERENCES catalogo_ajustes(id) ON DELETE RESTRICT,
  CONSTRAINT ck_contajuste_valor CHECK (valor_unitario >= 0 AND valor_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cada firmante recibe su PROPIO enlace: único, de un solo uso y con
-- vencimiento. Nadie puede firmar por otro. La evidencia que hace defendible la
-- firma —IP, dispositivo, hora, OTP y hash del documento— queda en la fila.
CREATE TABLE IF NOT EXISTS contrato_firmas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contrato_id     INT UNSIGNED NOT NULL,
  rol_firma       ENUM('propietario','socio_propietario','inquilino','garante','testigo') NOT NULL,
  usuario_id      INT UNSIGNED NULL,
  nombre          VARCHAR(191) NOT NULL,
  numero_documento VARCHAR(40) NULL,
  telefono        VARCHAR(30) NULL,
  orden           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- Guarda el SHA-256 del token, no el token: quien lea la base no puede
  -- usar los enlaces. 64 caracteres hexadecimales. Nulo hasta que se emita,
  -- y se vuelve a nulo al usarse — el enlace es de un solo uso.
  token_firma     CHAR(64) NULL,
  token_expira_at TIMESTAMP NULL,
  enviado_at      TIMESTAMP NULL,
  visto_at        TIMESTAMP NULL,
  otp_enviado_at  TIMESTAMP NULL,
  otp_verificado  BOOLEAN NOT NULL DEFAULT FALSE,
  estado          ENUM('pendiente','enviado','visto','firmado','rechazado','expirado')
                  NOT NULL DEFAULT 'pendiente',
  firmado_at      TIMESTAMP NULL,
  ip              VARCHAR(45) NULL,
  user_agent      VARCHAR(255) NULL,
  proveedor_firma VARCHAR(60) NULL,
  evidencia       JSON NULL,
  UNIQUE KEY uk_firma_token (token_firma),
  KEY ix_firmas_contrato (contrato_id, estado),
  CONSTRAINT fk_firmas_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE,
  CONSTRAINT fk_firmas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
