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
  mode?: "migrate" | "status" | "seed" | "promote" | "delete-user";
  /** Para `promote` y `delete-user`: a qué cuenta aplica. */
  email?: string;
  /** Para `promote`: qué rol otorgar. Hoy solo tiene sentido admin_yalqui — es
   *  el único rol global, y es el que resuelve el problema del huevo y la
   *  gallina: sin un primer administrador, nadie puede otorgar roles desde la
   *  pantalla de administración. */
  rol?: "admin_yalqui";
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

  if (mode === "promote") {
    return promover(event.email, event.rol ?? "admin_yalqui");
  }
  if (mode === "delete-user") {
    return borrarUsuario(event.email);
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

/**
 * Otorga un rol a una cuenta ya registrada. Pensado para el primer
 * `admin_yalqui`: ese rol es el único con el que se pueden otorgar los demás
 * desde la pantalla de administración, y sin uno ya en la base no hay forma de
 * crear el siguiente por ahí. La cuenta tiene que existir — se registra por el
 * flujo normal, `auth.registrar`, para que la contraseña quede cifrada con el
 * mismo scrypt que cualquier otra.
 *
 * Idempotente: otorgarlo dos veces no duplica la fila ni falla, igual que
 * `otorgarRol` en el servidor.
 */
async function promover(email: string | undefined, rol: string) {
  if (!email) throw new Error("Falta el correo de la cuenta a promover");

  const conn = await conectar();
  try {
    const [usuarios] = await conn.query<any[]>(
      "SELECT id, nombre, apellido FROM usuarios WHERE email = ?",
      [email],
    );
    const usuario = usuarios[0];
    if (!usuario) {
      throw new Error(`No existe ninguna cuenta con el correo ${email}. Registrala primero con auth.registrar.`);
    }

    // El único rol global es admin_yalqui, y ambito_id va en 0 por convención:
    // no hay «sobre qué» cuando el alcance es todo el sistema.
    await conn.execute(
      `INSERT INTO usuario_roles (usuario_id, rol, ambito_tipo, ambito_id)
       VALUES (?, ?, 'global', 0)
       ON DUPLICATE KEY UPDATE revocado_at = NULL, otorgado_at = CURRENT_TIMESTAMP`,
      [usuario.id, rol],
    );

    return { mode: "promote", email, usuarioId: usuario.id, rol, ok: true };
  } finally {
    await conn.end();
  }
}

/**
 * Borra una cuenta, pero solo si no tiene nada colgando de ella.
 *
 * Existe para limpiar cuentas de prueba — como la que se usa para verificar
 * que el registro funciona después de un despliegue — sin arriesgarse a
 * romper una referencia real. Si la cuenta tiene algún rol, inmueble,
 * aplicación o contrato, se niega en vez de intentar arrastrar el borrado: eso
 * requeriría decidir qué hacer con cada tabla relacionada, y esta función no
 * es el lugar para esa decisión.
 */
async function borrarUsuario(email: string | undefined) {
  if (!email) throw new Error("Falta el correo de la cuenta a borrar");

  const conn = await conectar();
  try {
    const [usuarios] = await conn.query<any[]>("SELECT id FROM usuarios WHERE email = ?", [email]);
    const usuario = usuarios[0];
    if (!usuario) return { mode: "delete-user", email, ok: false, motivo: "No existe esa cuenta" };

    const revisiones: Array<[string, string]> = [
      ["usuario_roles", "usuario_id"],
      ["inmuebles", "propietario_id"],
      ["inmueble_propietarios", "usuario_id"],
      ["aplicaciones", "inquilino_id"],
      ["contratos", "propietario_id"],
      ["visitas", "interesado_id"],
    ];

    for (const [tabla, columna] of revisiones) {
      const [filas] = await conn.query<any[]>(
        `SELECT COUNT(*) AS n FROM ${tabla} WHERE ${columna} = ?`,
        [usuario.id],
      );
      if (Number(filas[0].n) > 0) {
        return {
          mode: "delete-user", email, ok: false,
          motivo: `Tiene ${filas[0].n} fila(s) en ${tabla}: no se borra una cuenta con datos reales`,
        };
      }
    }

    await conn.beginTransaction();
    try {
      await conn.execute("DELETE FROM consentimientos WHERE usuario_id = ?", [usuario.id]);
      await conn.execute("DELETE FROM usuarios WHERE id = ?", [usuario.id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }

    return { mode: "delete-user", email, usuarioId: usuario.id, ok: true };
  } finally {
    await conn.end();
  }
}
