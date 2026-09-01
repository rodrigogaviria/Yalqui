import { defineConfig } from "drizzle-kit";

/** Solo para introspección local: genera el esquema desde la base ya migrada.
 *  Las migraciones siguen siendo los .sql versionados, no drizzle-kit. */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/*.ts",
  out: "./drizzle-introspect",
  dbCredentials: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "yalqui",
  },
});
