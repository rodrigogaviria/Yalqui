-- 024 · Áreas comunes y sus reservas.
--
-- El propietario configura, unidad por unidad, qué se puede reservar en su
-- edificio (salón social, BBQ, cancha...). Si no configuró ninguna, la unidad
-- simplemente no tiene nada que reservar: no hace falta una bandera aparte,
-- basta con que la tabla esté vacía para esa unidad.
--
-- Una reserva nace siempre `pendiente`. Aprobarla o rechazarla es un paso
-- del mismo propietario, separado de pedirla, igual que ya pasa con los
-- interesados en una unidad.

CREATE TABLE IF NOT EXISTS areas_comunes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inmueble_id    INT UNSIGNED NOT NULL,
  nombre         VARCHAR(120) NOT NULL,
  descripcion    VARCHAR(255) NULL,
  capacidad      SMALLINT UNSIGNED NULL,
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  creada_por_id  INT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_areascomunes_inmueble (inmueble_id, activa),
  CONSTRAINT fk_areascomunes_inmueble FOREIGN KEY (inmueble_id) REFERENCES inmuebles(id) ON DELETE CASCADE,
  CONSTRAINT fk_areascomunes_creada_por FOREIGN KEY (creada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reservas (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  area_comun_id    INT UNSIGNED NOT NULL,
  solicitante_id   INT UNSIGNED NOT NULL,
  -- A nombre de quién queda, que no siempre es quien la registra.
  solicitante      VARCHAR(191) NOT NULL,
  fecha            DATE NOT NULL,
  hora_inicio      TIME NOT NULL,
  hora_fin         TIME NOT NULL,
  estado           ENUM('pendiente','aprobada','rechazada','cancelada') NOT NULL DEFAULT 'pendiente',
  decidida_por_id  INT UNSIGNED NULL,
  decidida_at      TIMESTAMP NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_reservas_area_fecha (area_comun_id, fecha, estado),
  KEY ix_reservas_solicitante (solicitante_id),
  CONSTRAINT fk_reservas_area FOREIGN KEY (area_comun_id) REFERENCES areas_comunes(id) ON DELETE CASCADE,
  CONSTRAINT fk_reservas_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservas_decidida_por FOREIGN KEY (decidida_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
