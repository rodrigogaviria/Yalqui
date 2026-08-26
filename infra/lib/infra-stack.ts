import * as path from "node:path";
import * as fs from "node:fs";
import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

const REPO_ROOT = path.join(__dirname, "..", "..");
const BACKEND = path.join(REPO_ROOT, "backend");
const FRONTEND_DIST = path.join(REPO_ROOT, "frontend", "dist");
const ROOT_LOCK = path.join(REPO_ROOT, "package-lock.json");

export interface InfraStackProps extends StackProps {
  appDomain: string;
  zone: route53.IHostedZone;
}

export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const { appDomain, zone } = props;
    const recordName = appDomain.endsWith(`.${zone.zoneName}`)
      ? appDomain.slice(0, appDomain.length - zone.zoneName.length - 1)
      : appDomain;

    // VPC sin NAT Gateway — mismo patrón de FRUBA
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // RDS MySQL
    const db = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_43 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      databaseName: "yalqui",
      credentials: rds.Credentials.fromGeneratedSecret("yalqui_admin"),
      backupRetention: Duration.days(7),
      deletionProtection: false, // TODO: true antes de producción real
      removalPolicy: RemovalPolicy.SNAPSHOT,
      publiclyAccessible: false,
    });

    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      description: "Yalqui — secreto de firma de JWT",
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    const dbEnv: Record<string, string> = {
      DB_HOST: db.dbInstanceEndpointAddress,
      DB_PORT: db.dbInstanceEndpointPort,
      DB_NAME: "yalqui",
      DB_USER: db.secret!.secretValueFromJson("username").unsafeUnwrap(),
      DB_PASSWORD: db.secret!.secretValueFromJson("password").unsafeUnwrap(),
      NODE_ENV: "production",
    };

    const bundling: nodejs.BundlingOptions = {
      format: nodejs.OutputFormat.CJS,
      target: "node20",
      nodeModules: ["mysql2"],
    };

    // Lambda API (handler.ts existente con tRPC)
    const apiFn = new nodejs.NodejsFunction(this, "ApiFn", {
      entry: path.join(BACKEND, "src", "handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(20),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      depsLockFilePath: ROOT_LOCK,
      bundling,
      environment: {
        ...dbEnv,
        JWT_SECRET: jwtSecret.secretValue.unsafeUnwrap(),
        JWT_EXPIRES_IN: "7d",
        CORS_ORIGIN: `https://${appDomain}`,
      },
    });
    db.connections.allowDefaultPortFrom(apiFn, "Lambda API a MySQL");
    
    const initFn = new nodejs.NodejsFunction(this, "InitDbFn", {
      functionName: "yalqui-init-db",
      entry: path.join(BACKEND, "src", "db", "init-handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.minutes(3),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      depsLockFilePath: ROOT_LOCK,
      bundling: { ...bundling, loader: { ".sql": "text" } },
      environment: dbEnv,
    });
    db.connections.allowDefaultPortFrom(initFn, "Lambda init a MySQL");

    // API Gateway v2 (HttpApi) en vez del v1 que teníamos
    const httpApi = new HttpApi(this, "HttpApi", {
      defaultIntegration: new HttpLambdaIntegration("ApiIntegration", apiFn),
    });
    const apiDomain = `${httpApi.httpApiId}.execute-api.${this.region}.amazonaws.com`;

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: appDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Bucket de uploads — fotos de inmuebles
    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    uploadsBucket.grantPut(apiFn);
    apiFn.addEnvironment("UPLOADS_BUCKET", uploadsBucket.bucketName);

    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      code: cloudfront.FunctionCode.fromInline(
        [
          "function handler(event) {",
          "  var request = event.request;",
          "  var uri = request.uri;",
          "  if (uri.endsWith('/')) { request.uri = '/index.html'; }",
          "  else if (!uri.includes('.')) { request.uri = '/index.html'; }",
          "  return request;",
          "}",
        ].join("\n")
      ),
    });

    const apiBehavior: cloudfront.BehaviorOptions = {
      origin: new origins.HttpOrigin(apiDomain),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      domainNames: [appDomain],
      certificate,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        "/trpc/*": apiBehavior,
        "/health": apiBehavior,
        "/uploads/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(uploadsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    const distExists = fs.existsSync(path.join(FRONTEND_DIST, "index.html"));
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: distExists
        ? [s3deploy.Source.asset(FRONTEND_DIST)]
        : [s3deploy.Source.data("index.html", "<!doctype html><title>Yalqui</title><h1>Desplegando…</h1>")],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    const cfTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, "AliasApp", { zone, recordName, target: cfTarget });
    new route53.AaaaRecord(this, "AliasAppV6", { zone, recordName, target: cfTarget });

    new CfnOutput(this, "SiteUrl", { value: `https://${appDomain}` });
    new CfnOutput(this, "CloudFrontDomain", { value: distribution.distributionDomainName });
    new CfnOutput(this, "ApiEndpoint", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "DbEndpoint", { value: db.dbInstanceEndpointAddress });
    new CfnOutput(this, "DbSecretName", { value: db.secret!.secretName });
    new CfnOutput(this, "InitDbFunctionName", { value: initFn.functionName });
  }
}