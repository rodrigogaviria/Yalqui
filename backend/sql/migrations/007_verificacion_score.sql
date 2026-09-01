-- Fase 2 · Verificación externa y score del inquilino.
--
-- Dos números que nunca se promedian: el de verificaciones es crediticio y
-- externo —lo que dice la central antes de firmar— y el de scores_inquilino es
-- de comportamiento e interno —lo que hizo dentro de Yalqui después de firmar.

CREATE TABLE IF NOT EXISTS proveedores_verificacion (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo            VARCHAR(40) NOT NULL,
  nombre            VARCHAR(120) NOT NULL,
  tipos_soportados  JSON NOT NULL,
  modo              ENUM('api','manual') NOT NULL DEFAULT 'api',
  costo_consulta    DECIMAL(10,2) NULL,
  vigencia_dias     SMALLINT UNSIGNED NOT NULL DEFAULT 90,
  config            JSON NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_provverif_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cuelga del usuario y no de la aplicación: aplicar a cinco inmuebles no puede
-- costar cinco consultas. `vigente_hasta` es lo que permite reutilizarla.
CREATE TABLE IF NOT EXISTS verificaciones (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id            INT UNSIGNED NOT NULL,
  proveedor_id          INT UNSIGNED NULL,
  consentimiento_id     INT UNSIGNED NULL,
  servicio_contratado_id INT UNSIGNED NULL,
  tipo                  ENUM('identidad','documento','antecedentes_judiciales','antecedentes_policiales',
                             'listas_restrictivas','centrales_riesgo','laboral') NOT NULL,
  estado                ENUM('solicitada','en_proceso','completada','fallida','expirada') NOT NULL DEFAULT 'solicitada',
  resultado             ENUM('aprobado','con_observaciones','rechazado') NULL,
  motivo_fallo          ENUM('consentimiento_faltante','datos_invalidos','sujeto_no_encontrado',
                             'proveedor_no_disponible','resultado_parcial','credenciales_invalidas',
                             'cuota_excedida','timeout_proveedor') NULL,
  score                 DECIMAL(6,2) NULL,
  escala_min            SMALLINT UNSIGNED NULL,
  escala_max            SMALLINT UNSIGNED NULL,
  cuota_mensual_estimada DECIMAL(14,2) NULL,
  hallazgos             JSON NULL,
  respuesta             JSON NULL,
  id_externo            VARCHAR(120) NULL,
  costo                 DECIMAL(10,2) NULL,
  vigente_hasta         DATE NULL,
  solicitada_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completada_at         TIMESTAMP NULL,
  KEY ix_verif_usuario (usuario_id, tipo, vigente_hasta),
  KEY ix_verif_estado (estado, solicitada_at),
  UNIQUE KEY uk_verif_externo (proveedor_id, id_externo),
  CONSTRAINT fk_verif_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_verif_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores_verificacion(id) ON DELETE SET NULL,
  CONSTRAINT fk_verif_consent FOREIGN KEY (consentimiento_id) REFERENCES consentimientos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Qué verificaciones respaldaron cada decisión. Sin esto no se puede
-- reconstruir con qué evidencia el propietario aprobó.
CREATE TABLE IF NOT EXISTS aplicacion_verificaciones (
  aplicacion_id   INT UNSIGNED NOT NULL,
  verificacion_id INT UNSIGNED NOT NULL,
  adjuntada_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (aplicacion_id, verificacion_id),
  KEY ix_aplverif_verificacion (verificacion_id),
  CONSTRAINT fk_aplverif_aplicacion FOREIGN KEY (aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_aplverif_verificacion FOREIGN KEY (verificacion_id) REFERENCES verificaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS garantes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  aplicacion_id   INT UNSIGNED NULL,
  contrato_id     INT UNSIGNED NULL,
  tipo            ENUM('codeudor','coarrendatario','fiador','poliza') NOT NULL,
  usuario_id      INT UNSIGNED NULL,
  nombre          VARCHAR(191) NOT NULL,
  tipo_documento  ENUM('CC','CE','NIT','PA') NULL,
  numero_documento VARCHAR(40) NULL,
  telefono        VARCHAR(30) NULL,
  email           VARCHAR(191) NULL,
  aseguradora     VARCHAR(120) NULL,
  numero_poliza   VARCHAR(60) NULL,
  vigencia_hasta  DATE NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_garantes_aplicacion (aplicacion_id),
  KEY ix_garantes_contrato (contrato_id),
  CONSTRAINT fk_garantes_aplicacion FOREIGN KEY (aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_garantes_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE,
  CONSTRAINT fk_garantes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Catálogo de dimensiones con sus pesos. Es tabla y no enum porque los pesos
-- se van a calibrar con datos reales. `ventana_meses` es la caducidad del dato
-- negativo: sin ella un mal semestre persigue a alguien para siempre, y con el
-- score portable lo persigue en todas partes.
CREATE TABLE IF NOT EXISTS dimensiones_score (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo              ENUM('pagos','cuidado_inmueble','convivencia','comunicacion','documentacion') NOT NULL,
  nombre              VARCHAR(120) NOT NULL,
  descripcion         VARCHAR(255) NULL,
  explicacion_publica TEXT NULL,
  como_mejorar        TEXT NULL,
  peso                DECIMAL(4,3) NOT NULL,
  puntaje_base        DECIMAL(5,2) NOT NULL DEFAULT 70.00,
  ventana_meses       SMALLINT UNSIGNED NOT NULL DEFAULT 24,
  calculo             ENUM('automatico','manual','mixto') NOT NULL DEFAULT 'automatico',
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  orden               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  vigente_desde       DATE NOT NULL,
  vigente_hasta       DATE NULL,
  UNIQUE KEY uk_dimscore_codigo (codigo, vigente_desde)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El score se deriva de acá; nadie lo escribe a mano. Solo inserción.
-- origen_tipo + origen_id lo hacen auditable e idempotente: un pago tardío
-- genera exactamente una fila por más veces que corra el recálculo.
CREATE TABLE IF NOT EXISTS eventos_score (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquilino_id        INT UNSIGNED NOT NULL,
  contrato_id         INT UNSIGNED NULL,
  dimension_id        INT UNSIGNED NOT NULL,
  tipo_evento         ENUM('pago_puntual','pago_tardio','pago_incumplido','acuerdo_cumplido',
                           'dano_atribuible','inspeccion_favorable','inspeccion_desfavorable',
                           'queja_confirmada','norma_incumplida','respuesta_oportuna',
                           'documento_tardio','contrato_renovado','entrega_sin_novedad',
                           'ayuda_vecino') NOT NULL,
  impacto             DECIMAL(5,2) NOT NULL,
  origen_tipo         ENUM('pago_arriendo','incidencia','pqrs','inspeccion','contrato',
                           'ayuda_vecino','manual') NOT NULL,
  origen_id           BIGINT UNSIGNED NULL,
  descripcion         VARCHAR(255) NULL,
  explicacion_publica VARCHAR(255) NOT NULL,
  registrado_por_id   INT UNSIGNED NULL,
  estado              ENUM('vigente','en_reclamo','anulado') NOT NULL DEFAULT 'vigente',
  motivo_anulacion    VARCHAR(255) NULL,
  anulado_por_id      INT UNSIGNED NULL,
  anulado_at          TIMESTAMP NULL,
  ocurrido_at         TIMESTAMP NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_evscore_inquilino (inquilino_id, ocurrido_at),
  UNIQUE KEY uk_evscore_origen (origen_tipo, origen_id, tipo_evento),
  KEY ix_evscore_dimension (dimension_id),
  CONSTRAINT fk_evscore_inquilino FOREIGN KEY (inquilino_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_evscore_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL,
  CONSTRAINT fk_evscore_dimension FOREIGN KEY (dimension_id) REFERENCES dimensiones_score(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una foto por recálculo. Ausencia de fila no es score bajo: es sin historia,
-- y la interfaz tiene que distinguirlo.
CREATE TABLE IF NOT EXISTS scores_inquilino (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquilino_id    INT UNSIGNED NOT NULL,
  puntaje_global  DECIMAL(5,2) NOT NULL,
  puntaje_anterior DECIMAL(5,2) NULL,
  delta           DECIMAL(5,2) NULL,
  nivel           ENUM('excelente','bueno','regular','riesgo','critico') NOT NULL,
  num_contratos   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  meses_historia  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  num_eventos     INT UNSIGNED NOT NULL DEFAULT 0,
  version_modelo  VARCHAR(20) NOT NULL,
  vigente         BOOLEAN NOT NULL DEFAULT TRUE,
  calculado_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vigente_uk      INT UNSIGNED AS (IF(vigente, inquilino_id, NULL)) VIRTUAL,
  UNIQUE KEY uk_score_vigente (vigente_uk),
  KEY ix_score_inquilino (inquilino_id, calculado_at),
  CONSTRAINT fk_score_inquilino FOREIGN KEY (inquilino_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Guarda el peso aplicado y no lo lee del catálogo: así una foto vieja se
-- sigue explicando con los pesos que regían ese día.
CREATE TABLE IF NOT EXISTS score_dimensiones (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  score_id      INT UNSIGNED NOT NULL,
  dimension_id  INT UNSIGNED NOT NULL,
  puntaje       DECIMAL(5,2) NOT NULL,
  peso_aplicado DECIMAL(4,3) NOT NULL,
  num_eventos   INT UNSIGNED NOT NULL DEFAULT 0,
  tendencia     ENUM('sube','estable','baja') NOT NULL DEFAULT 'estable',
  UNIQUE KEY uk_scoredim (score_id, dimension_id),
  CONSTRAINT fk_scoredim_score FOREIGN KEY (score_id) REFERENCES scores_inquilino(id) ON DELETE CASCADE,
  CONSTRAINT fk_scoredim_dimension FOREIGN KEY (dimension_id) REFERENCES dimensiones_score(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cada corrida de un modelo, con su entrada y su confianza. La tarea `riesgo`
-- nace deshabilitada: no hay incumplimientos observados con qué entrenarla.
CREATE TABLE IF NOT EXISTS analisis_ia (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entidad_tipo           ENUM('precalificacion','aplicacion_documento','incidencia_foto','inmueble_foto') NOT NULL,
  entidad_id             BIGINT UNSIGNED NOT NULL,
  tarea                  ENUM('extraccion','normalizacion_ingreso','inconsistencia',
                              'autenticidad_documento','resumen','riesgo') NOT NULL,
  modelo                 VARCHAR(80) NOT NULL,
  version_modelo         VARCHAR(40) NULL,
  entrada_hash           CHAR(64) NULL,
  salida                 JSON NULL,
  confianza              DECIMAL(4,3) NULL,
  hallazgos              JSON NULL,
  requiere_revision_humana BOOLEAN NOT NULL DEFAULT FALSE,
  revisado_por_id        INT UNSIGNED NULL,
  revisado_at            TIMESTAMP NULL,
  decision_humana        ENUM('confirmada','corregida','descartada') NULL,
  costo                  DECIMAL(10,4) NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_ia_entidad (entidad_tipo, entidad_id),
  KEY ix_ia_revision (tarea, requiere_revision_humana),
  CONSTRAINT fk_ia_revisor FOREIGN KEY (revisado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
