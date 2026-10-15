-- Un gasto (o ingreso) anotado a mano puede quedar pendiente: se sabe que
-- hay que pagarlo, pero todavía no salió de la cuenta. Mientras esté
-- pendiente no cuenta en Mis Rendimientos — eso sigue siendo caja real.
ALTER TABLE movimientos
  ADD COLUMN estado ENUM('pendiente', 'finalizado') NOT NULL DEFAULT 'finalizado' AFTER tipo;
