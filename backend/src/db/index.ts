import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index.js";

/**
 * Pool a nivel de módulo: se reutiliza entre invocaciones de la misma Lambda.
 *
 * `connectionLimit` es bajo a propósito. Una RDS t4g.micro admite alrededor de
 * 85 conexiones; con el valor por defecto de mysql2, que es 10, bastarían nueve
 * contenedores concurrentes para agotarla. Este límite y la concurrencia
 * reservada de la Lambda tienen que moverse juntos.
 */
const LIMITE_CONEXIONES = Number(process.env.DB_POOL_LIMIT ?? 2);

const pool = mysql.createPool({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: LIMITE_CONEXIONES,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 8_000,
  // Explícito y no por defecto: si la conexión negocia latin1, cada tilde que
  // pase por acá se guarda doblemente codificada — «Atlántico» queda como
  // «AtlÃ¡ntico» en la base y ya no hay forma de saber cuál era el original
  // sin adivinar. Es exactamente lo que pasó al sembrar los catálogos con el
  // cliente de línea de comandos en el charset equivocado.
  charset: "utf8mb4",
  timezone: "Z",
  decimalNumbers: false,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
});

export const db = drizzle(pool, { schema, mode: "default" });
export type Database = typeof db;

/** Comprueba que la Lambda alcanza RDS. Devuelve la latencia en milisegundos. */
export async function verificarConexion(): Promise<{ ok: boolean; latenciaMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query("SELECT 1");
    } finally {
      conn.release();
    }
    return { ok: true, latenciaMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latenciaMs: Date.now() - t0, error: (e as Error).message };
  }
}
