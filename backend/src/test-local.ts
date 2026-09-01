import { appRouter } from "./router.js";
import { db } from "./db/index.js";

/**
 * Prueba local contra una MySQL alcanzable. Con las variables DB_* apuntando a
 * un contenedor local sirve para ejercer el contrato sin desplegar.
 *   npx tsx src/test-local.ts
 */
async function main() {
  const caller = appRouter.createCaller({ db, usuario: null });

  console.log("ping:", await caller.salud.ping());
  console.log("base de datos:", await caller.salud.baseDatos());

  try {
    console.log("migraciones:", await caller.salud.migraciones());
  } catch (e) {
    console.log("migraciones: sin aplicar todavía —", (e as Error).message);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
