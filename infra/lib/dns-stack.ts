import { Stack, StackProps, CfnOutput, Fn } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";

export interface YalquiDnsStackProps extends StackProps {
  domainName: string;
}

export class YalquiDnsStack extends Stack {
  public readonly zone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: YalquiDnsStackProps) {
    super(scope, id, props);

    this.zone = new route53.PublicHostedZone(this, "Zone", {
      zoneName: props.domainName,
    });

    new CfnOutput(this, "NameServers", {
      value: Fn.join(", ", this.zone.hostedZoneNameServers!),
      description: "Copia estos 4 nameservers y pégalos en GoDaddy",
    });
  }
}