import * as cdk from "aws-cdk-lib";
import { YalquiDnsStack } from "../lib/dns-stack";
import { InfraStack } from "../lib/infra-stack";

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" };

const dns = new YalquiDnsStack(app, "YalquiDnsStack", {
  env,
  domainName: "yalqui.com.co",
});

/**
 * El dominio se conecta aparte: `cdk deploy -c dominio=si`.
 *
 * Mientras el registrador no delegue yalqui.com.co a los nameservers de la zona
 * de este stack, la validación DNS del certificado nunca completa y el
 * despliegue se queda colgado hasta que expira. Sin la bandera el stack sube
 * base de datos y API — el backend queda vivo en la URL de API Gateway — y el
 * frente se agrega después sin recrear nada.
 */
const conDominio = app.node.tryGetContext("dominio") === "si";

new InfraStack(app, "YalquiStack", {
  env,
  ...(conDominio ? { appDomain: "app.yalqui.com.co", zone: dns.zone } : {}),
});
