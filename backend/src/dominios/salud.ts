import { sql } from "drizzle-orm";
import { router, publico } from "../trpc/base.js";
import { verificarConexion } from "../db/index.js";

/**
 * Dominio de salud. Existe para responder la pregunta que hasta ahora nadie
 * podía responder: ¿la Lambda alcanza RDS?
 */
export const saludRouter = router({
  /** Vivo, sin tocar la base. */
  ping: publico.query(() => ({ ok: true, at: new Date().toISOString() })),

  /** Prueba real de conectividad, con latencia. */
  baseDatos: publico.query(async () => {
    const r = await verificarConexion();
    return { ...r, at: new Date().toISOString() };
  }),

  /** Los planes vigentes con lo que desbloquea cada uno.
   *  Público a propósito: es la misma información del anexo comercial. */
  planes: publico.query(async ({ ctx }) => {
    const [filas] = (await ctx.db.execute(sql`
      SELECT p.codigo, p.nombre, p.precio_mes, p.moneda, p.descripcion,
             COUNT(c.id) AS caracteristicas
        FROM planes p
        LEFT JOIN plan_caracteristicas c ON c.plan_id = p.id AND c.incluida = 1
       WHERE p.activo = 1
       GROUP BY p.id
       ORDER BY p.orden
    `)) as unknown as any[];
    return { total: filas.length, planes: filas };
  }),

  /** Qué migraciones alcanzó a aplicar la base. */
  migraciones: publico.query(async ({ ctx }) => {
    const filas = await ctx.db.execute(
      sql`SELECT version, nombre, aplicada_at FROM schema_migrations ORDER BY version`,
    );
    const lista = (filas as unknown as any[])[0] ?? [];
    return { total: lista.length, migraciones: lista };
  }),
});
