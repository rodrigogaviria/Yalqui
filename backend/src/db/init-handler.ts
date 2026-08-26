import mysql from "mysql2/promise";
// @ts-ignore - se importa como texto plano (loader configurado en CDK)
import schemaSql from "../../sql/schema.sql";

async function applySchema() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    multipleStatements: true,
  });
  await conn.query(schemaSql);
  await conn.end();
  return "aplicado";
}

async function seed() {
  // TODO: agregar datos de ejemplo cuando exista el modelo real,
  // o migrar al patrón de seeders versionados de FRUBA.
  return "sin seeders definidos aún";
}

export async function handler(event: { mode?: "schema" | "seed" | "all" }) {
  const mode = event.mode ?? "all";
  const result: Record<string, string> = { mode };
  if (mode === "schema" || mode === "all") result.schema = await applySchema();
  if (mode === "seed" || mode === "all") result.seed = await seed();
  return result;
}