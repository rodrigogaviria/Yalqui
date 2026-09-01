import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { MIGRACIONES, type Migracion } from "../../sql/migrations/index.js";

/**
 * Aplica migraciones versionadas, en orden y una sola vez.
 *
 * Se invoca a mano o desde el flujo de despliegue — nunca desde la API.
 * Es idempotente: correrla dos veces no cambia nada. No borra ni reescribe
 * nada: solo aplica lo que falta.
 */

const TABLA_CONTROL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20) NOT NULL PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  checksum    CHAR(64) NOT NULL,
  aplicada_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duracion_ms INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

const huella = (sql: string) => createHash("sha256").update(sql).digest("hex");

/** Parte el archivo en sentencias para no necesitar multipleStatements. */
function sentencias(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s.length > 0);
}

function conectar() {
  return mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    connectTimeout: 10_000,
  });
}

export interface ResultadoMigracion {
  version: string;
  nombre: string;
  estado: "aplicada" | "ya_estaba" | "checksum_distinto";
  duracionMs?: number;
}

async function migrar(soloVerificar: boolean): Promise<ResultadoMigracion[]> {
  const conn = await conectar();
  try {
    await conn.query(TABLA_CONTROL);
    const [filas] = await conn.query<any[]>("SELECT version, checksum FROM schema_migrations");
    const aplicadas = new Map<string, string>(filas.map((f) => [f.version, f.checksum]));

    const resultados: ResultadoMigracion[] = [];
    for (const m of MIGRACIONES as Migracion[]) {
      const hash = huella(m.sql);
      const previo = aplicadas.get(m.version);

      if (previo !== undefined) {
        // Una migración ya aplicada no se vuelve a correr. Si su contenido
        // cambió, se avisa en vez de reaplicar: reescribir historia es peor.
        resultados.push({
          version: m.version,
          nombre: m.nombre,
          estado: previo === hash ? "ya_estaba" : "checksum_distinto",
        });
        continue;
      }
      if (soloVerificar) {
        resultados.push({ version: m.version, nombre: m.nombre, estado: "aplicada" });
        continue;
      }

      const t0 = Date.now();
      for (const s of sentencias(m.sql)) await conn.query(s);
      const duracionMs = Date.now() - t0;
      await conn.execute(
        "INSERT INTO schema_migrations (version, nombre, checksum, duracion_ms) VALUES (?, ?, ?, ?)",
        [m.version, m.nombre, hash, duracionMs],
      );
      resultados.push({ version: m.version, nombre: m.nombre, estado: "aplicada", duracionMs });
    }
    return resultados;
  } finally {
    await conn.end();
  }
}

export interface EventoInit {
  mode?: "migrate" | "status" | "seed";
}

export async function handler(event: EventoInit = {}) {
  const mode = event.mode ?? "migrate";

  if (mode === "status") {
    return { mode, migraciones: await migrar(true) };
  }
  if (mode === "seed") {
    // Los catálogos que el sistema necesita para funcionar —planes,
    // características, ajustes del canon y la regla de precalificación— van
    // dentro de las migraciones, no acá: sin ellos no se puede crear una
    // suscripción ni armar un canon, así que no son datos opcionales.
    // Este modo queda para datos de demostración, que todavía no existen.
    return { mode, resultado: "PENDIENTE_DE_DEFINIR — sin datos de demostración" };
  }

  const migraciones = await migrar(false);
  const conflictos = migraciones.filter((m) => m.estado === "checksum_distinto");
  return {
    mode,
    aplicadas: migraciones.filter((m) => m.estado === "aplicada").length,
    yaEstaban: migraciones.filter((m) => m.estado === "ya_estaba").length,
    conflictos: conflictos.map((c) => c.version),
    migraciones,
  };
}
