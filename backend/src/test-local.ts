import { appRouter } from './router.js';

async function main() {
  const caller = appRouter.createCaller({});

  await caller.crearTarea({ titulo: 'Configurar AWS' });
  await caller.crearTarea({ titulo: 'Conectar Claude Code' });

  const resultado = await caller.listarTareas();
  console.log(resultado);
}

main();