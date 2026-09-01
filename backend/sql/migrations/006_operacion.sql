-- Fase 2 · Operación del inmueble: proveedores, incidencias, inspecciones y alertas.
-- Va primero de la fase 2 porque incidencias y alertas las referencian varias
-- de las que vienen después.

CREATE TABLE IF NOT EXISTS proveedores (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id           INT UNSIGNED NULL,
  razon_social         VARCHAR(191) NOT NULL,
  nit                  VARCHAR(30) NULL,
  especialidades       JSON NULL,
  ciudad               VARCHAR(120) NULL,
  telefono             VARCHAR(30) NULL,
  email                VARCHAR(191) NULL,
  calificacion_promedio DECIMAL(3,2) NULL,
  trabajos_completados INT UNSIGNED NOT NULL DEFAULT 0,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_proveedores_ciudad (ciudad, activo),
  CONSTRAINT fk_proveedores_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Porteros, vigilancia, aseo y mantenimiento interno. El administrador del
-- edificio NO va acá: es rol propio, porque decide y contrata mientras estos
-- ejecutan. Ninguno de los dos ve canon ni scores.
CREATE TABLE IF NOT EXISTS personal_propiedad (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT UNSIGNED NULL,
  edificacion_id INT UNSIGNED NOT NULL,
  cargo          ENUM('portero','vigilante','aseo','jardineria','mantenimiento','otro') NOT NULL,
  nombre         VARCHAR(191) NOT NULL,
  telefono       VARCHAR(30) NULL,
  turno          ENUM('dia','noche','rotativo','administrativo') NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  desde          DATE NOT NULL,
  hasta          DATE NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_personal_edificacion (edificacion_id, activo),
  KEY ix_personal_usuario (usuario_id),
  CONSTRAINT fk_personal_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_personal_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La matriz de permisos como datos. `condicion` cubre lo que depende de una
-- columna y no solo del rol: un socio decide únicamente si puede_decidir.
CREATE TABLE IF NOT EXISTS permisos_rol (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rol         ENUM('admin_yalqui','administrador_inmueble','propietario','socio_propietario',
                   'inquilino','personal_propiedad','proveedor') NOT NULL,
  ambito_tipo ENUM('global','inmueble','edificacion','contrato') NOT NULL,
  permiso     VARCHAR(64) NOT NULL,
  otorgado    BOOLEAN NOT NULL DEFAULT TRUE,
  condicion   VARCHAR(64) NULL,
  nota        VARCHAR(255) NULL,
  UNIQUE KEY uk_permiso (rol, ambito_tipo, permiso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- inmueble_id y edificacion_id son ambos nulos porque una incidencia es de una
-- unidad o de zonas comunes, nunca de las dos. Siempre hay exactamente una.
CREATE TABLE IF NOT EXISTS incidencias (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ambito            ENUM('unidad','area_comun') NOT NULL,
  inmueble_id       INT UNSIGNED NULL,
  edificacion_id    INT UNSIGNED NULL,
  contrato_id       INT UNSIGNED NULL,
  reportada_por_id  INT UNSIGNED NOT NULL,
  categoria         ENUM('plomeria','electrico','estructural','electrodomesticos','cerrajeria',
                         'humedad','ascensor','otro') NOT NULL,
  prioridad         ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media',
  estado            ENUM('abierta','asignada','en_progreso','espera_aprobacion','resuelta',
                         'cerrada','rechazada') NOT NULL DEFAULT 'abierta',
  titulo            VARCHAR(191) NOT NULL,
  descripcion       TEXT NULL,
  responsable_costo ENUM('propietario','inquilino','compartido','copropiedad','por_definir')
                    NOT NULL DEFAULT 'por_definir',
  proveedor_id      INT UNSIGNED NULL,
  costo_estimado    DECIMAL(14,2) NULL,
  costo_final       DECIMAL(14,2) NULL,
  reportada_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sla_vence_at      TIMESTAMP NULL,
  resuelta_at       TIMESTAMP NULL,
  cerrada_at        TIMESTAMP NULL,
  KEY ix_incid_estado_sla (estado, sla_vence_at),
  KEY ix_incid_inmueble (inmueble_id, reportada_at),
  KEY ix_incid_edificacion (edificacion_id, reportada_at),
  KEY ix_incid_proveedor (proveedor_id),
  CONSTRAINT fk_incid_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_incid_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_incid_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL,
  CONSTRAINT fk_incid_reporta FOREIGN KEY (reportada_por_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incid_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL,
  CONSTRAINT ck_incid_ambito CHECK (
    (ambito = 'unidad'     AND inmueble_id IS NOT NULL AND edificacion_id IS NULL) OR
    (ambito = 'area_comun' AND edificacion_id IS NOT NULL AND inmueble_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS incidencia_eventos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incidencia_id INT UNSIGNED NOT NULL,
  autor_id      INT UNSIGNED NULL,
  tipo          ENUM('comentario','cambio_estado','asignacion','cotizacion','foto','cierre') NOT NULL,
  contenido     TEXT NULL,
  archivo_id    BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_incidev_incidencia (incidencia_id, created_at),
  CONSTRAINT fk_incidev_incidencia FOREIGN KEY (incidencia_id) REFERENCES incidencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_incidev_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_incidev_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La de entrada es la línea base; la de salida se compara contra ella, y esa
-- diferencia —no el estado absoluto— es la que genera el evento de score.
CREATE TABLE IF NOT EXISTS inspecciones (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id            INT UNSIGNED NOT NULL,
  contrato_id            INT UNSIGNED NULL,
  tipo                   ENUM('entrada','periodica','salida') NOT NULL,
  realizada_por_id       INT UNSIGNED NULL,
  fecha                  DATE NOT NULL,
  estado_general         ENUM('excelente','bueno','regular','malo') NOT NULL,
  puntaje                DECIMAL(5,2) NULL,
  items                  JSON NULL,
  observaciones          TEXT NULL,
  acta_archivo_id        BIGINT UNSIGNED NULL,
  firmada_por_inquilino  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_insp_inmueble (inmueble_id, tipo, fecha),
  KEY ix_insp_contrato (contrato_id),
  CONSTRAINT fk_insp_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_insp_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL,
  CONSTRAINT fk_insp_autor FOREIGN KEY (realizada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_insp_acta FOREIGN KEY (acta_archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Referencia genérica por entidad_tipo + entidad_id en vez de una FK por cada
-- tipo. Es el único lugar del modelo donde se acepta ese compromiso, porque
-- las alertas son transversales y desechables.
CREATE TABLE IF NOT EXISTS alertas (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo           ENUM('mora','contrato_por_vencer','pago_fallido','pago_por_verificar',
                      'incidencia_sla','riesgo_inquilino','score_actualizado',
                      'suscripcion_morosa','documento_pendiente','servicio_vencido') NOT NULL,
  severidad      ENUM('info','media','alta','critica') NOT NULL DEFAULT 'media',
  entidad_tipo   VARCHAR(60) NOT NULL,
  entidad_id     BIGINT UNSIGNED NOT NULL,
  destinatario_id INT UNSIGNED NOT NULL,
  titulo         VARCHAR(191) NOT NULL,
  mensaje        TEXT NULL,
  estado         ENUM('nueva','vista','atendida','descartada') NOT NULL DEFAULT 'nueva',
  generada_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vista_at       TIMESTAMP NULL,
  atendida_at    TIMESTAMP NULL,
  KEY ix_alertas_destinatario (destinatario_id, estado, generada_at),
  KEY ix_alertas_entidad (entidad_tipo, entidad_id),
  CONSTRAINT fk_alertas_destinatario FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auditoria (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id     INT UNSIGNED NULL,
  accion       VARCHAR(80) NOT NULL,
  entidad_tipo VARCHAR(60) NOT NULL,
  entidad_id   BIGINT UNSIGNED NOT NULL,
  antes        JSON NULL,
  despues      JSON NULL,
  ip           VARCHAR(45) NULL,
  user_agent   VARCHAR(255) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_auditoria_entidad (entidad_tipo, entidad_id, created_at),
  KEY ix_auditoria_actor (actor_id, created_at),
  CONSTRAINT fk_auditoria_actor FOREIGN KEY (actor_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
