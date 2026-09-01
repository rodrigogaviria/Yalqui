-- 002 · Visita, precalificación y aplicación.
-- Fase 1. La precalificación corre sobre ingresos DECLARADOS y no llama a nadie:
-- por eso cabe acá aunque las verificaciones externas sean de fase 2.

CREATE TABLE IF NOT EXISTS visitas (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id        INT UNSIGNED NOT NULL,
  interesado_id      INT UNSIGNED NULL,
  nombre_contacto    VARCHAR(191) NULL,
  telefono_contacto  VARCHAR(30)  NULL,
  email_contacto     VARCHAR(191) NULL,
  inicio_at          TIMESTAMP NOT NULL,
  fin_at             TIMESTAMP NULL,
  modalidad          ENUM('presencial','virtual') NOT NULL DEFAULT 'presencial',
  estado             ENUM('solicitada','confirmada','reprogramada','realizada','cancelada','no_asistio')
                     NOT NULL DEFAULT 'solicitada',
  reprogramada_de_id INT UNSIGNED NULL,
  notas              TEXT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_visitas_inmueble (inmueble_id, inicio_at),
  KEY ix_visitas_estado (estado, inicio_at),
  CONSTRAINT fk_visitas_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_visitas_interesado FOREIGN KEY (interesado_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_visitas_reprog FOREIGN KEY (reprogramada_de_id) REFERENCES visitas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El criterio como datos y con versiones. Cada precalificación guarda con qué
-- regla se evaluó: sin eso no se puede explicar una decisión de hace ocho meses.
CREATE TABLE IF NOT EXISTS reglas_precalificacion (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo               VARCHAR(40) NOT NULL,
  nombre               VARCHAR(120) NOT NULL,
  version              SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  condiciones          JSON NULL,
  umbral_holgado       DECIMAL(5,2) NOT NULL DEFAULT 35.00,
  umbral_ajustado      DECIMAL(5,2) NOT NULL DEFAULT 45.00,
  umbral_limite        DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  exige_aportante_desde DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  estado               ENUM('borrador','vigente','archivada') NOT NULL DEFAULT 'borrador',
  vigente_desde        DATE NULL,
  vigente_hasta        DATE NULL,
  creada_por_id        INT UNSIGNED NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_reglas_codigo_version (codigo, version),
  KEY ix_reglas_estado (estado),
  CONSTRAINT fk_reglas_creador FOREIGN KEY (creada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Preaprobado NO es aprobado: los ingresos son declarados y nadie los ha probado.
-- Edad, género y ciudad de nacimiento se piden para identidad y ficha;
-- NO entran en el cálculo. La preaprobación sale de una sola cuenta.
CREATE TABLE IF NOT EXISTS precalificaciones (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  visita_id            INT UNSIGNED NULL,
  inmueble_id          INT UNSIGNED NOT NULL,
  interesado_id        INT UNSIGNED NULL,
  -- Guarda el SHA-256 del token, no el token: quien lea la base no puede
  -- usar los enlaces. 64 caracteres hexadecimales. Nulo hasta que se emita,
  -- y se vuelve a nulo al usarse — el enlace es de un solo uso.
  token                CHAR(64) NULL,
  token_expira_at      TIMESTAMP NOT NULL,
  nombre_completo      VARCHAR(191) NULL,
  tipo_documento       ENUM('CC','CE','NIT','PA') NULL,
  numero_documento     VARCHAR(40) NULL,
  fecha_nacimiento     DATE NULL,
  ciudad_nacimiento    VARCHAR(120) NULL,
  genero               ENUM('femenino','masculino','no_binario','otro','prefiere_no_decir') NULL,
  ocupacion            ENUM('estudiante','empleado','independiente','pensionado') NULL,
  ingresos_declarados  DECIMAL(14,2) NULL,
  ingresos_aportantes  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  ingresos_totales     DECIMAL(14,2) NULL,
  ingreso_verificado   DECIMAL(14,2) NULL,
  metodo_ingreso       ENUM('declarado','extractos','nomina') NOT NULL DEFAULT 'declarado',
  antiguedad_laboral_meses SMALLINT UNSIGNED NULL,
  variabilidad_ingreso DECIMAL(5,2) NULL,
  cuota_creditos       DECIMAL(14,2) NULL,
  canon_evaluado       DECIMAL(14,2) NOT NULL,
  gastos_unidad        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  disponible_estimado  DECIMAL(14,2) NULL,
  num_dependientes     TINYINT UNSIGNED NULL,
  canon_anterior       DECIMAL(14,2) NULL,
  motivo_mudanza       VARCHAR(255) NULL,
  relacion_pct         DECIMAL(5,2) NULL,
  regla_id             INT UNSIGNED NULL,
  nivel                ENUM('holgado','ajustado','al_limite','no_alcanza') NULL,
  razones              JSON NULL,
  requiere_revision    BOOLEAN NOT NULL DEFAULT FALSE,
  estado               ENUM('enviada','en_diligenciamiento','preaprobada','con_reservas','no_alcanza','expirada')
                       NOT NULL DEFAULT 'enviada',
  enviada_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completada_at        TIMESTAMP NULL,
  UNIQUE KEY uk_precal_token (token),
  KEY ix_precal_inmueble (inmueble_id, estado),
  KEY ix_precal_visita (visita_id),
  CONSTRAINT fk_precal_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_precal_visita FOREIGN KEY (visita_id) REFERENCES visitas(id) ON DELETE SET NULL,
  CONSTRAINT fk_precal_interesado FOREIGN KEY (interesado_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_precal_regla FOREIGN KEY (regla_id) REFERENCES reglas_precalificacion(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El aportante responde por sí mismo, con su propio enlace. Que el aplicante
-- marque «mi mamá acepta» es una afirmación de parte interesada sobre alguien
-- que no ha dicho nada: no sirve como compromiso ni para tratar sus datos.
CREATE TABLE IF NOT EXISTS precalificacion_aportantes (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  precalificacion_id  INT UNSIGNED NOT NULL,
  nombre              VARCHAR(191) NOT NULL,
  relacion            ENUM('madre','padre','pareja','hermano','familiar','empleador','amigo','otro') NOT NULL,
  tipo_documento      ENUM('CC','CE','NIT','PA') NULL,
  numero_documento    VARCHAR(40) NULL,
  telefono            VARCHAR(30) NOT NULL,
  ocupacion           ENUM('estudiante','empleado','independiente','pensionado') NULL,
  ingresos_declarados DECIMAL(14,2) NULL,
  -- Guarda el SHA-256 del token, no el token: quien lea la base no puede
  -- usar los enlaces. 64 caracteres hexadecimales. Nulo hasta que se emita,
  -- y se vuelve a nulo al usarse — el enlace es de un solo uso.
  token               CHAR(64) NULL,
  token_expira_at     TIMESTAMP NOT NULL,
  estado              ENUM('pendiente','confirmado','rechazado','expirado') NOT NULL DEFAULT 'pendiente',
  acepta_ser_codeudor BOOLEAN NOT NULL DEFAULT FALSE,
  consentimiento_id   INT UNSIGNED NULL,
  enviado_at          TIMESTAMP NULL,
  confirmado_at       TIMESTAMP NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_aportante_token (token),
  KEY ix_aportante_precal (precalificacion_id),
  CONSTRAINT fk_aportante_precal FOREIGN KEY (precalificacion_id) REFERENCES precalificaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_aportante_consent FOREIGN KEY (consentimiento_id) REFERENCES consentimientos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS aplicaciones (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id         INT UNSIGNED NOT NULL,
  inquilino_id        INT UNSIGNED NOT NULL,
  precalificacion_id  INT UNSIGNED NULL,
  estado              ENUM('borrador','enviada','en_verificacion','en_negociacion',
                           'aprobada','rechazada','retirada','convertida') NOT NULL DEFAULT 'borrador',
  canon_ofrecido      DECIMAL(14,2) NULL,
  fecha_ingreso_deseada DATE NULL,
  num_ocupantes       TINYINT UNSIGNED NULL,
  num_mascotas        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  mensaje             TEXT NULL,
  enviada_at          TIMESTAMP NULL,
  decidida_at         TIMESTAMP NULL,
  decidida_por_id     INT UNSIGNED NULL,
  motivo_rechazo      VARCHAR(500) NULL,
  contrato_id         INT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_aplic_inmueble (inmueble_id, estado),
  KEY ix_aplic_inquilino (inquilino_id, estado),
  CONSTRAINT fk_aplic_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_aplic_inquilino FOREIGN KEY (inquilino_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_aplic_precal FOREIGN KEY (precalificacion_id) REFERENCES precalificaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_aplic_decisor FOREIGN KEY (decidida_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Lo que el aplicante eligió. Sin esto, dos aplicantes que ofrecen el mismo
-- canon no son comparables: uno quiere parqueadero y el otro no.
CREATE TABLE IF NOT EXISTS aplicacion_ajustes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  aplicacion_id  INT UNSIGNED NOT NULL,
  ajuste_id      INT UNSIGNED NOT NULL,
  cantidad       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  valor_unitario DECIMAL(14,2) NOT NULL,
  valor_total    DECIMAL(14,2) NOT NULL,
  UNIQUE KEY uk_aplajuste (aplicacion_id, ajuste_id),
  CONSTRAINT fk_aplajuste_aplic FOREIGN KEY (aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_aplajuste_catalogo FOREIGN KEY (ajuste_id) REFERENCES catalogo_ajustes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- estado_revision es revisión HUMANA, no verificación externa. En la fase 1 el
-- propietario mira los papeles con sus propios ojos.
CREATE TABLE IF NOT EXISTS aplicacion_documentos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  aplicacion_id   INT UNSIGNED NOT NULL,
  tipo            ENUM('documento_identidad','certificado_laboral','extractos_bancarios',
                       'declaracion_renta','referencia','rut','otro') NOT NULL,
  archivo_id      BIGINT UNSIGNED NULL,
  obligatorio     BOOLEAN NOT NULL DEFAULT FALSE,
  estado_revision ENUM('pendiente','aceptado','rechazado') NOT NULL DEFAULT 'pendiente',
  revisado_por_id INT UNSIGNED NULL,
  revisado_at     TIMESTAMP NULL,
  nota            VARCHAR(500) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_aplidoc_revision (aplicacion_id, estado_revision),
  CONSTRAINT fk_aplidoc_aplic FOREIGN KEY (aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_aplidoc_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE SET NULL,
  CONSTRAINT fk_aplidoc_revisor FOREIGN KEY (revisado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
