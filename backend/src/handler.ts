import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import { appRouter } from './router.js';


// TODO: cuando exista RDS, agregar createContext aquí para inyectar la conexión a la base de datos

export const handler = awsLambdaRequestHandler({
  router: appRouter,
});