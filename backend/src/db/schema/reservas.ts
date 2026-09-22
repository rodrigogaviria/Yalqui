// El uso de las áreas comunes de una unidad: qué se puede reservar y quién
// pidió qué. Vive aparte de `inventario.ts` porque no describe la unidad sino
// lo que pasa alrededor de ella.
import {
  mysqlTable, int, varchar, date, time, timestamp, smallint, boolean, mysqlEnum, index,
} from "drizzle-orm/mysql-core";

import { inmuebles } from "./inventario.js";
import { usuarios } from "./identidad.js";

/** Un recurso reservable de la unidad: salón social, BBQ, cancha, lo que sea.
 *  Sin ninguna fila acá, la unidad no tiene nada que reservar. */
export const areasComunes = mysqlTable("areas_comunes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  inmuebleId: int("inmueble_id", { unsigned: true }).notNull()
    .references(() => inmuebles.id, { onDelete: "cascade" }),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  descripcion: varchar("descripcion", { length: 255 }),
  capacidad: smallint("capacidad", { unsigned: true }),
  activa: boolean("activa").notNull().default(true),
  creadaPorId: int("creada_por_id", { unsigned: true })
    .references(() => usuarios.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_areascomunes_inmueble").on(t.inmuebleId, t.activa)]);

export const ESTADOS_RESERVA = ["pendiente", "aprobada", "rechazada", "cancelada"] as const;

/** Nace pendiente siempre: aprobar o rechazar es un paso aparte, nunca algo
 *  que quien reserva decide por su cuenta. */
export const reservas = mysqlTable("reservas", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  areaComunId: int("area_comun_id", { unsigned: true }).notNull()
    .references(() => areasComunes.id, { onDelete: "cascade" }),
  solicitanteId: int("solicitante_id", { unsigned: true }).notNull()
    .references(() => usuarios.id, { onDelete: "restrict" }),
  /** A nombre de quién queda, que no siempre es quien la registra: el
   *  propietario puede estar reservando para su inquilino. */
  solicitante: varchar("solicitante", { length: 191 }).notNull(),
  fecha: date("fecha").notNull(),
  horaInicio: time("hora_inicio").notNull(),
  horaFin: time("hora_fin").notNull(),
  estado: mysqlEnum("estado", ESTADOS_RESERVA).notNull().default("pendiente"),
  decididaPorId: int("decidida_por_id", { unsigned: true })
    .references(() => usuarios.id, { onDelete: "set null" }),
  decididaAt: timestamp("decidida_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_reservas_area_fecha").on(t.areaComunId, t.fecha, t.estado),
  index("ix_reservas_solicitante").on(t.solicitanteId),
]);
