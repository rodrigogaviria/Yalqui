-- Fase 2 · Comunicación, promoción y precio sugerido.
--
-- WhatsApp no es «un canal más»: fuera de la ventana de 24 horas solo se puede
-- mandar plantilla aprobada por Meta. Por eso hay dos tablas que no existirían
-- si solo mandáramos correos.

CREATE TABLE IF NOT EXISTS plantillas_mensaje (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo           VARCHAR(60) NOT NULL,
  nombre           VARCHAR(120) NOT NULL,
  canal            ENUM('whatsapp','email','sms','push','app') NOT NULL,
  categoria        ENUM('cobranza','comunicado','transaccional','incidencia','contrato','comercial') NOT NULL,
  asunto           VARCHAR(191) NULL,
  cuerpo           TEXT NOT NULL,
  variables        JSON NULL,
  idioma           CHAR(5) NOT NULL DEFAULT 'es_CO',
  nombre_meta      VARCHAR(120) NULL,
  categoria_meta   ENUM('utility','authentication','marketing') NULL,
  estado_aprobacion ENUM('borrador','en_revision','aprobada','rechazada','pausada') NOT NULL DEFAULT 'borrador',
  motivo_rechazo   VARCHAR(255) NULL,
  version          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_plantilla (codigo, idioma, version),
  KEY ix_plantilla_canal (canal, estado_aprobacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La llave es el teléfono y no el usuario: un número puede escribir antes de
-- tener cuenta. opt_out es definitivo hasta que la persona vuelva a escribir.
CREATE TABLE IF NOT EXISTS conversaciones_whatsapp (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  telefono          VARCHAR(30) NOT NULL,
  usuario_id        INT UNSIGNED NULL,
  ultimo_entrante_at TIMESTAMP NULL,
  ventana_expira_at TIMESTAMP NULL,
  estado            ENUM('abierta','cerrada','opt_out','bloqueado') NOT NULL DEFAULT 'cerrada',
  opt_out_at        TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_convwa_telefono (telefono),
  KEY ix_convwa_ventana (ventana_expira_at),
  CONSTRAINT fk_convwa_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS comunicados (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  autor_id            INT UNSIGNED NOT NULL,
  ambito              ENUM('unidad','contrato','portafolio','edificacion','global') NOT NULL,
  inmueble_id         INT UNSIGNED NULL,
  contrato_id         INT UNSIGNED NULL,
  propietario_id      INT UNSIGNED NULL,
  edificacion_id      INT UNSIGNED NULL,
  tipo                ENUM('aviso','mantenimiento','incremento_canon','recordatorio',
                           'emergencia','normativo','comercial') NOT NULL,
  titulo              VARCHAR(191) NOT NULL,
  cuerpo              TEXT NOT NULL,
  prioridad           ENUM('baja','normal','alta','urgente') NOT NULL DEFAULT 'normal',
  requiere_confirmacion BOOLEAN NOT NULL DEFAULT FALSE,
  canales             JSON NOT NULL,
  plantilla_id        INT UNSIGNED NULL,
  adjunto_archivo_id  BIGINT UNSIGNED NULL,
  estado              ENUM('borrador','programado','enviando','enviado','cancelado') NOT NULL DEFAULT 'borrador',
  programado_para     TIMESTAMP NULL,
  enviado_at          TIMESTAMP NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_comunicado_ambito (ambito, inmueble_id),
  KEY ix_comunicado_cola (estado, programado_para),
  CONSTRAINT fk_comunicado_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_comunicado_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_comunicado_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_comunicado_plantilla FOREIGN KEY (plantilla_id) REFERENCES plantillas_mensaje(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Se resuelve al enviar y se congela: si mañana el inquilino se muda, el
-- comunicado que recibió sigue siendo suyo.
CREATE TABLE IF NOT EXISTS comunicado_destinatarios (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comunicado_id  INT UNSIGNED NOT NULL,
  usuario_id     INT UNSIGNED NOT NULL,
  rol_destinatario ENUM('inquilino','propietario','garante','proveedor') NOT NULL,
  estado         ENUM('pendiente','enviado','entregado','leido','confirmado','fallido') NOT NULL DEFAULT 'pendiente',
  leido_at       TIMESTAMP NULL,
  confirmado_at  TIMESTAMP NULL,
  UNIQUE KEY uk_comdest (comunicado_id, usuario_id),
  KEY ix_comdest_usuario (usuario_id, estado),
  CONSTRAINT fk_comdest_comunicado FOREIGN KEY (comunicado_id) REFERENCES comunicados(id) ON DELETE CASCADE,
  CONSTRAINT fk_comdest_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Categoría y canal se separan a propósito: querer los avisos de mora por
-- WhatsApp pero las novedades comerciales por ningún lado es legítimo.
-- cobranza y contrato no se pueden apagar del todo; sí elegir el canal.
CREATE TABLE IF NOT EXISTS preferencias_notificacion (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  categoria  ENUM('cobranza','comunicado','incidencia','contrato','score','vecinos','comercial') NOT NULL,
  canal      ENUM('whatsapp','email','sms','push','app') NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_prefnotif (usuario_id, categoria, canal),
  CONSTRAINT fk_prefnotif_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una sola tabla para los cuatro casos: Truora, centrales, WhatsApp y pasarela.
-- Deduplica por id de EVENTO y no de recurso, porque un mismo check genera
-- varios eventos legítimos.
CREATE TABLE IF NOT EXISTS eventos_webhook (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proveedor         VARCHAR(60) NOT NULL,
  id_evento_externo VARCHAR(191) NOT NULL,
  tipo              VARCHAR(80) NULL,
  cuerpo            JSON NOT NULL,
  firma_valida      BOOLEAN NOT NULL DEFAULT FALSE,
  procesado_at      TIMESTAMP NULL,
  error             VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_webhook_evento (proveedor, id_evento_externo),
  KEY ix_webhook_pendientes (procesado_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- marketplace_partner nace no_disponible: Meta solo lo permite por programa de
-- socios cerrado. La fila existe para que el día que se apruebe sea un UPDATE.
CREATE TABLE IF NOT EXISTS canales_publicacion (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo               ENUM('facebook_page','instagram','meta_catalog','marketplace_partner','portal_externo') NOT NULL,
  nombre               VARCHAR(120) NOT NULL,
  proveedor            VARCHAR(60) NULL,
  requiere_aprobacion  BOOLEAN NOT NULL DEFAULT FALSE,
  estado               ENUM('disponible','no_disponible','en_gestion') NOT NULL DEFAULT 'no_disponible',
  paises               JSON NULL,
  costo_por_publicacion DECIMAL(10,2) NULL,
  limite_fotos         TINYINT UNSIGNED NULL,
  requisitos           JSON NULL,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_canalpub_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Publicar es fácil; despublicar es lo que se olvida. Sin id_externo guardado,
-- el aviso queda vivo y le siguen llamando por algo que ya arrendó.
CREATE TABLE IF NOT EXISTS publicaciones_externas (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id      INT UNSIGNED NOT NULL,
  canal_id         INT UNSIGNED NOT NULL,
  publicada_por_id INT UNSIGNED NULL,
  estado           ENUM('borrador','en_revision','publicada','rechazada','pausada','expirada','eliminada')
                   NOT NULL DEFAULT 'borrador',
  id_externo       VARCHAR(191) NULL,
  url_externa      VARCHAR(500) NULL,
  titulo           VARCHAR(191) NULL,
  cuerpo           TEXT NULL,
  fotos_incluidas  JSON NULL,
  respuesta        JSON NULL,
  motivo_rechazo   VARCHAR(255) NULL,
  publicada_at     TIMESTAMP NULL,
  expira_at        TIMESTAMP NULL,
  ultima_sync_at   TIMESTAMP NULL,
  UNIQUE KEY uk_pubext_externo (canal_id, id_externo),
  KEY ix_pubext_inmueble (inmueble_id, estado),
  CONSTRAINT fk_pubext_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_pubext_canal FOREIGN KEY (canal_id) REFERENCES canales_publicacion(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pubext_autor FOREIGN KEY (publicada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS valoraciones (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id             INT UNSIGNED NOT NULL,
  servicio_contratado_id  INT UNSIGNED NULL,
  canon_sugerido          DECIMAL(14,2) NOT NULL,
  rango_min               DECIMAL(14,2) NULL,
  rango_max               DECIMAL(14,2) NULL,
  ocupantes_base          TINYINT UNSIGNED NULL,
  costo_servicios_incluidos DECIMAL(14,2) NULL,
  confianza               DECIMAL(4,3) NULL,
  version_modelo          VARCHAR(40) NOT NULL,
  comparables             JSON NULL,
  supuestos               JSON NULL,
  generada_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aplicada                BOOLEAN NOT NULL DEFAULT FALSE,
  aplicada_at             TIMESTAMP NULL,
  KEY ix_valoracion_inmueble (inmueble_id, generada_at),
  CONSTRAINT fk_valoracion_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_valoracion_servicio FOREIGN KEY (servicio_contratado_id) REFERENCES servicios_contratados(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El canon es base más ajustes, así que el motor sugiere la estructura y no un
-- número. base_calculo separa lo que sale del mercado de lo que sale de la
-- cuenta del propio inmueble: cobrar $60.000 por persona mientras los servicios
-- suben $90.000 es perder plata con cada ocupante de más.
CREATE TABLE IF NOT EXISTS valoracion_ajustes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  valoracion_id INT UNSIGNED NOT NULL,
  ajuste_id     INT UNSIGNED NOT NULL,
  valor_sugerido DECIMAL(14,2) NOT NULL,
  rango_min     DECIMAL(14,2) NULL,
  rango_max     DECIMAL(14,2) NULL,
  base_calculo  ENUM('comparables','costo_marginal','mixto') NOT NULL DEFAULT 'comparables',
  justificacion VARCHAR(255) NULL,
  confianza     DECIMAL(4,3) NULL,
  UNIQUE KEY uk_valajuste (valoracion_id, ajuste_id),
  CONSTRAINT fk_valajuste_valoracion FOREIGN KEY (valoracion_id) REFERENCES valoraciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_valajuste_catalogo FOREIGN KEY (ajuste_id) REFERENCES catalogo_ajustes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS empresas_servicio_publico (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(40) NOT NULL,
  nombre          VARCHAR(120) NOT NULL,
  tipo_servicio   ENUM('energia','acueducto','gas','aseo','internet','tv','telefonia') NOT NULL,
  ciudades        JSON NULL,
  tiene_api       BOOLEAN NOT NULL DEFAULT FALSE,
  metodo_consulta ENUM('api','scraping','comprobante','ninguno') NOT NULL DEFAULT 'comprobante',
  url_portal      VARCHAR(255) NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_empservp_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Todo lo que se paga aparte del canon: servicios y, cuando aplica, la
-- administración. titular y responsable_pago no son lo mismo: la cuenta suele
-- quedar a nombre del propietario aunque pague el inquilino.
CREATE TABLE IF NOT EXISTS cuentas_cobro (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id       INT UNSIGNED NOT NULL,
  tipo              ENUM('energia','acueducto','gas','aseo','internet','tv','telefonia',
                         'administracion','cuota_extraordinaria') NOT NULL,
  empresa_id        INT UNSIGNED NULL,
  edificacion_id    INT UNSIGNED NULL,
  numero_cuenta     VARCHAR(60) NULL,
  titular           ENUM('propietario','inquilino','administracion') NOT NULL DEFAULT 'propietario',
  responsable_pago  ENUM('propietario','inquilino') NOT NULL DEFAULT 'inquilino',
  incluido_en_canon BOOLEAN NOT NULL DEFAULT FALSE,
  promedio_mensual  DECIMAL(14,2) NULL,
  tope_incluido     DECIMAL(14,2) NULL,
  dia_vencimiento   TINYINT UNSIGNED NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cuentacobro (inmueble_id, tipo, numero_cuenta),
  KEY ix_cuentacobro_inmueble (inmueble_id, activo, responsable_pago),
  CONSTRAINT fk_cuentacobro_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_cuentacobro_empresa FOREIGN KEY (empresa_id) REFERENCES empresas_servicio_publico(id) ON DELETE SET NULL,
  CONSTRAINT fk_cuentacobro_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
