import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // TODO: esta ruta asume que 'infra/' y 'backend/' son carpetas hermanas dentro del mismo repo.
    // Si se reorganiza la estructura del monorepo, ajustar este path.

    const trpcLambda = new lambda.NodejsFunction(this, 'TrpcHandler', {
      entry: path.join(__dirname, '../../backend/src/handler.ts'),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      projectRoot: path.join(__dirname, '../../backend'),
      depsLockFilePath: path.join(__dirname, '../../backend/package-lock.json'),
      // TODO: agregar variables de entorno reales cuando exista la DB
      // environment: {
      //   DATABASE_URL: 'TODO: reemplazar con el connection string de RDS',
      //   JWT_SECRET_ARN: 'TODO: reemplazar con el ARN del secreto en Secrets Manager',
      // },
    });

    const api = new apigateway.LambdaRestApi(this, 'TrpcApi', {
      handler: trpcLambda,
      proxy: true,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
    });
  }
}