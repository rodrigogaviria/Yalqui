import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { saludar } from './handlers/hello.js';
import { crear, listar } from './handlers/tareas.js';

const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ nombre: z.string() }))
    .query(({ input }) => {
      return saludar(input.nombre);
    }),
    crearTarea: t.procedure
    .input(z.object({ titulo: z.string() }))
    .mutation(({ input }) => {
      return crear(input.titulo);
    }),

  listarTareas: t.procedure
    .query(() => {
      return listar();
    }),
});

export type AppRouter = typeof appRouter;
