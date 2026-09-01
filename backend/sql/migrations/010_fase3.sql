-- Fase 3 · Rentabilidad, conciliación, convivencia con evidencia y vecinos.
-- Casi todo acá depende de datos que todavía no existen: la conciliación
-- necesita extractos, el score necesita historia, la rentabilidad necesita
-- meses de movimientos.

-- Dos niveles: la unidad y la edificación. Pintar la fachada no es gasto de
-- ningún apartaestudio; se registra en la edificación y, si el propietario
-- quiere rentabilidad por unidad, se reparte en filas hijas que apuntan al
-- padre. El reparto se congela: agregar unidades el año entrante no lo mueve.
CREATE TABLE IF NOT EXISTS movimientos (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ambito              ENUM('unidad','edificacion') NOT NULL,
  inmueble_id         INT UNSIGNED NULL,
  edificacion_id      INT UNSIGNED NULL,
  contrato_id         INT UNSIGNED NULL,
  movimiento_padre_id BIGINT UNSIGNED NULL,
  tipo                ENUM('ingreso','egreso') NOT NULL,
  categoria           ENUM('canon','administracion','mantenimiento','fachada','zonas_comunes',
                           'impuesto_predial','seguro','suscripcion_yalqui','servicio_yalqui','otro') NOT NULL,
  monto               DECIMAL(14,2) NOT NULL,
  fecha               DATE NOT NULL,
  prorrateo           ENUM('ninguno','partes_iguales','por_area','por_canon') NOT NULL DEFAULT 'ninguno',
  origen_tipo         ENUM('pago_arriendo','incidencia','factura_yalqui','obligacion','manual') NOT NULL,
  origen_id           BIGINT UNSIGNED NULL,
  nota                VARCHAR(255) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_mov_inmueble (inmueble_id, fecha),
  KEY ix_mov_edificacion (edificacion_id, fecha),
  KEY ix_mov_padre (movimiento_padre_id),
  KEY ix_mov_origen (origen_tipo, origen_id),
  CONSTRAINT fk_mov_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_padre FOREIGN KEY (movimiento_padre_id) REFERENCES movimientos(id) ON DELETE CASCADE,
  CONSTRAINT ck_mov_ambito CHECK (
    (ambito = 'unidad'      AND inmueble_id IS NOT NULL) OR
    (ambito = 'edificacion' AND edificacion_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Lo que dice el banco. Los créditos SIN conciliar son plata que entró y no
-- corresponde a ningún pago reportado: un inquilino que pagó y no avisó, que
-- hoy aparece como moroso.
CREATE TABLE IF NOT EXISTS movimientos_bancarios (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propietario_id     INT UNSIGNED NOT NULL,
  banco              VARCHAR(80) NOT NULL,
  cuenta_enmascarada VARCHAR(30) NULL,
  fecha              DATE NOT NULL,
  valor              DECIMAL(14,2) NOT NULL,
  tipo               ENUM('credito','debito') NOT NULL,
  referencia         VARCHAR(120) NULL,
  descripcion        VARCHAR(255) NULL,
  origen             ENUM('extracto','api_bancaria','manual') NOT NULL DEFAULT 'extracto',
  archivo_origen_id  BIGINT UNSIGNED NULL,
  estado             ENUM('sin_conciliar','conciliado','ignorado') NOT NULL DEFAULT 'sin_conciliar',
  pago_arriendo_id   INT UNSIGNED NULL,
  confianza          DECIMAL(4,3) NULL,
  conciliado_at      TIMESTAMP NULL,
  UNIQUE KEY uk_movbanc (propietario_id, banco, fecha, valor, referencia),
  KEY ix_movbanc_estado (propietario_id, estado, fecha),
  CONSTRAINT fk_movbanc_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_movbanc_pago FOREIGN KEY (pago_arriendo_id) REFERENCES pagos_arriendo(id) ON DELETE SET NULL,
  CONSTRAINT fk_movbanc_archivo FOREIGN KEY (archivo_origen_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El paquete que pide un abogado, armado de lo que ya está guardado. hash para
-- poder probar después que el expediente no se alteró.
CREATE TABLE IF NOT EXISTS expedientes_mora (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contrato_id      INT UNSIGNED NOT NULL,
  generado_por_id  INT UNSIGNED NOT NULL,
  periodo_desde    DATE NOT NULL,
  periodo_hasta    DATE NOT NULL,
  meses_en_mora    SMALLINT UNSIGNED NOT NULL,
  total_adeudado   DECIMAL(14,2) NOT NULL,
  num_requerimientos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  incluye          JSON NULL,
  archivo_id       BIGINT UNSIGNED NULL,
  hash_documento   CHAR(64) NULL,
  generado_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_expmora_contrato (contrato_id, generado_at),
  CONSTRAINT fk_expmora_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE,
  CONSTRAINT fk_expmora_autor FOREIGN KEY (generado_por_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expmora_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS publicacion_metricas (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  publicacion_id INT UNSIGNED NOT NULL,
  fecha          DATE NOT NULL,
  impresiones    INT UNSIGNED NOT NULL DEFAULT 0,
  clics          INT UNSIGNED NOT NULL DEFAULT 0,
  mensajes       INT UNSIGNED NOT NULL DEFAULT 0,
  guardados      INT UNSIGNED NOT NULL DEFAULT 0,
  costo          DECIMAL(10,2) NULL,
  sincronizado_at TIMESTAMP NULL,
  UNIQUE KEY uk_pubmetrica (publicacion_id, fecha),
  CONSTRAINT fk_pubmetrica_pub FOREIGN KEY (publicacion_id) REFERENCES publicaciones_externas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- `desconocido` es estado de primera clase y no NULL: si la empresa no tiene
-- API y nadie subió el recibo, el propietario debe ver «no sabemos». Decirle
-- que hay una deuda que nadie verificó es peor que no decirle nada.
CREATE TABLE IF NOT EXISTS facturas_cobro (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cuenta_id             INT UNSIGNED NOT NULL,
  periodo               CHAR(7) NOT NULL,
  fecha_emision         DATE NULL,
  fecha_vencimiento     DATE NULL,
  valor                 DECIMAL(14,2) NULL,
  consumo               DECIMAL(12,2) NULL,
  unidad_consumo        VARCHAR(20) NULL,
  estado                ENUM('pendiente','reportada','verificada','pagada','vencida','en_acuerdo','desconocido')
                        NOT NULL DEFAULT 'desconocido',
  pagada_at             TIMESTAMP NULL,
  fuente                ENUM('api','comprobante','manual') NOT NULL DEFAULT 'comprobante',
  comprobante_archivo_id BIGINT UNSIGNED NULL,
  reportado_por_id      INT UNSIGNED NULL,
  verificado_por_id     INT UNSIGNED NULL,
  verificado_at         TIMESTAMP NULL,
  sincronizado_at       TIMESTAMP NULL,
  respuesta             JSON NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_factcobro (cuenta_id, periodo),
  KEY ix_factcobro_estado (estado, fecha_vencimiento),
  CONSTRAINT fk_factcobro_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuentas_cobro(id) ON DELETE CASCADE,
  CONSTRAINT fk_factcobro_comprobante FOREIGN KEY (comprobante_archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La ubicación exacta se revela tarde a propósito: difundir «estoy sola y no
-- puedo entrar» con número de apartamento es un riesgo real.
CREATE TABLE IF NOT EXISTS solicitudes_ayuda (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitante_id INT UNSIGNED NOT NULL,
  inmueble_id    INT UNSIGNED NOT NULL,
  edificacion_id INT UNSIGNED NULL,
  categoria      ENUM('emergencia','domicilio','prestamo','mascota','acompanamiento','otro') NOT NULL,
  urgencia       ENUM('normal','alta','emergencia') NOT NULL DEFAULT 'normal',
  titulo         VARCHAR(191) NOT NULL,
  descripcion    TEXT NULL,
  ubicacion_aproximada VARCHAR(120) NULL,
  estado         ENUM('abierta','con_ofertas','aceptada','completada','expirada','cancelada')
                 NOT NULL DEFAULT 'abierta',
  aceptada_id    INT UNSIGNED NULL,
  expira_at      TIMESTAMP NULL,
  completada_at  TIMESTAMP NULL,
  confirmada_por_solicitante BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_ayuda_edificacion (edificacion_id, estado, created_at),
  CONSTRAINT fk_ayuda_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ayuda_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ayuda_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ayuda_respuestas (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitud_id INT UNSIGNED NOT NULL,
  vecino_id    INT UNSIGNED NOT NULL,
  mensaje      VARCHAR(500) NULL,
  estado       ENUM('ofrecida','aceptada','descartada','completada') NOT NULL DEFAULT 'ofrecida',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ayudaresp (solicitud_id, vecino_id),
  CONSTRAINT fk_ayudaresp_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes_ayuda(id) ON DELETE CASCADE,
  CONSTRAINT fk_ayudaresp_vecino FOREIGN KEY (vecino_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Solo resuelta_en_contra Y confirmada_por_propietario generan evento de score.
-- Una queja anónima recibida no es una falta probada, y el administrador de un
-- edificio no debería poder hundir la reputación de alguien en toda la
-- plataforma sin ser su arrendador.
CREATE TABLE IF NOT EXISTS pqrs (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id    INT UNSIGNED NULL,
  edificacion_id INT UNSIGNED NULL,
  contrato_id    INT UNSIGNED NULL,
  senalado_id    INT UNSIGNED NULL,
  tipo           ENUM('peticion','queja','reclamo','sugerencia','felicitacion') NOT NULL,
  categoria      ENUM('ruido','mascotas','basuras','parqueadero','areas_comunes','dano','convivencia','otro') NOT NULL,
  origen         ENUM('vecino','administracion','propietario','inquilino','porteria') NOT NULL,
  reportante_nombre VARCHAR(191) NULL,
  reportante_anonimo BOOLEAN NOT NULL DEFAULT FALSE,
  descripcion    TEXT NOT NULL,
  gravedad       ENUM('leve','moderada','grave') NOT NULL DEFAULT 'leve',
  estado         ENUM('recibida','en_revision','en_descargos','resuelta_en_contra',
                      'resuelta_a_favor','desestimada') NOT NULL DEFAULT 'recibida',
  descargos      TEXT NULL,
  resolucion     TEXT NULL,
  resuelta_por_id INT UNSIGNED NULL,
  confirmada_por_propietario BOOLEAN NOT NULL DEFAULT FALSE,
  confirmada_at  TIMESTAMP NULL,
  recibida_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelta_at    TIMESTAMP NULL,
  KEY ix_pqrs_edificacion (edificacion_id, recibida_at),
  KEY ix_pqrs_senalado (senalado_id, estado),
  CONSTRAINT fk_pqrs_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE SET NULL,
  CONSTRAINT fk_pqrs_edif FOREIGN KEY (edificacion_id) REFERENCES edificaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_pqrs_senalado FOREIGN KEY (senalado_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Hobbies, habilidades e idiomas. Sirven para describir y emparejar; nunca
-- para puntuar. No hay ninguna llave entre esto y dimensiones_score.
CREATE TABLE IF NOT EXISTS inquilino_atributos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  tipo       ENUM('hobby','habilidad','idioma','certificacion') NOT NULL,
  valor      VARCHAR(191) NOT NULL,
  verificado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inqatr (usuario_id, tipo, valor),
  KEY ix_inqatr_busqueda (tipo, valor),
  CONSTRAINT fk_inqatr_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS negociaciones (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  aplicacion_id INT UNSIGNED NULL,
  contrato_id   INT UNSIGNED NULL,
  tipo          ENUM('canon_inicial','renovacion') NOT NULL,
  estado        ENUM('abierta','aceptada','rechazada','expirada') NOT NULL DEFAULT 'abierta',
  expira_at     TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_negoc_aplicacion (aplicacion_id),
  KEY ix_negoc_contrato (contrato_id),
  CONSTRAINT fk_negoc_aplicacion FOREIGN KEY (aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_negoc_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS negociacion_ofertas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negociacion_id  INT UNSIGNED NOT NULL,
  autor_id        INT UNSIGNED NOT NULL,
  canon_propuesto DECIMAL(14,2) NOT NULL,
  meses_propuestos SMALLINT UNSIGNED NULL,
  condiciones     TEXT NULL,
  estado          ENUM('vigente','aceptada','rechazada','superada') NOT NULL DEFAULT 'vigente',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_negofer_negociacion (negociacion_id, created_at),
  CONSTRAINT fk_negofer_negociacion FOREIGN KEY (negociacion_id) REFERENCES negociaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_negofer_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cotizaciones (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incidencia_id INT UNSIGNED NOT NULL,
  proveedor_id  INT UNSIGNED NOT NULL,
  monto         DECIMAL(14,2) NOT NULL,
  descripcion   TEXT NULL,
  validez_hasta DATE NULL,
  estado        ENUM('enviada','aceptada','rechazada','expirada') NOT NULL DEFAULT 'enviada',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cotizacion (incidencia_id, proveedor_id),
  CONSTRAINT fk_cotiz_incidencia FOREIGN KEY (incidencia_id) REFERENCES incidencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_cotiz_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS amenidades (
  codigo    VARCHAR(40) NOT NULL PRIMARY KEY,
  nombre    VARCHAR(120) NOT NULL,
  categoria ENUM('edificio','unidad','zona') NOT NULL,
  icono     VARCHAR(40) NULL,
  activo    BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inmueble_amenidades (
  inmueble_id     INT UNSIGNED NOT NULL,
  amenidad_codigo VARCHAR(40) NOT NULL,
  PRIMARY KEY (inmueble_id, amenidad_codigo),
  KEY ix_inmamen_amenidad (amenidad_codigo),
  CONSTRAINT fk_inmamen_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_inmamen_amenidad FOREIGN KEY (amenidad_codigo) REFERENCES amenidades(codigo) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
