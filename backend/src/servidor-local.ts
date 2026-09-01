import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.js";
import { db } from "./db/index.js";
import { leerToken } from "./auth/token.js";
import { rolesDe } from "./auth/roles.js";
import type { Contexto } from "./context.js";

/**
 * Servidor local para desarrollo. No se despliega: en AWS el handler es
 * `handler.ts` sobre API Gateway. Existe para poder probar el frontend contra
 * el backend real sin desplegar nada.
 *   npx tsx src/servidor-local.ts
 */
const PUERTO = Number(process.env.PORT ?? 3000);

const servidor = createHTTPServer({
  router: appRouter,
  // CloudFront enruta /trpc/* hacia el API, así que el local sirve igual.
  basePath: "/trpc/",
  // El navegador manda una preflight antes de cada mutación con Authorization.
  middleware: (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "http://localhost:5173");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    next();
  },
  async createContext({ req }): Promise<Contexto> {
    const cabecera = req.headers.authorization;
    const token = cabecera?.toLowerCase().startsWith("bearer ")
      ? cabecera.slice(7)
      : undefined;

    const sesion = await leerToken(token);
    const base = {
      db,
      ip: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    };
    if (sesion === null) return { ...base, usuario: null };

    const roles = await rolesDe(db, sesion.usuarioId);
    return { ...base, usuario: { id: sesion.usuarioId, email: sesion.email, roles } };
  },
});

servidor.listen(PUERTO);
console.log(`API local en http://localhost:${PUERTO}/trpc`);
