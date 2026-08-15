import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import { appRouter } from './router.js';

export const handler = awsLambdaRequestHandler({
  router: appRouter,
});