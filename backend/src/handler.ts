import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import { appRouter } from "./router.js";
import { crearContexto } from "./context.js";

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext: crearContexto,
});
