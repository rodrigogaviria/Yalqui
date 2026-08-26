import { mysqlTable, varchar, timestamp, int } from "drizzle-orm/mysql-core";

// TODO: placeholder para validar el pipeline de inicialización.
// Cuando se defina el modelo real de Yalqui (inmuebles, arrendatarios,
// contratos, pagos), las tablas van aquí siguiendo este mismo patrón.
export const appMeta = mysqlTable("app_meta", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 191 }).notNull(),
  value: varchar("value", { length: 191 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});