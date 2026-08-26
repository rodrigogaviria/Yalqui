import * as cdk from "aws-cdk-lib";
import { YalquiDnsStack } from "../lib/dns-stack";
import { InfraStack } from "../lib/infra-stack";

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" };

const dns = new YalquiDnsStack(app, "YalquiDnsStack", {
  env,
  domainName: "yalqui.com.co",
});

new InfraStack(app, "YalquiStack", {
  env,
  appDomain: "app.yalqui.com.co",
  zone: dns.zone,
});