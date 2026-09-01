import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import { InfraStack } from "../lib/infra-stack";

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" };

/**
 * La zona de yalqui.com ya existe, está delegada en el registrador y es la que
 * hoy resuelve app.yalqui.com. Se referencia por id en vez de declararla.
 *
 * Declararla sería pedirle a CloudFormation que la cree, y como ya existe una
 * fuera de su control, cualquier cambio al nombre la haría reemplazar: crea una
 * zona nueva con OTROS cuatro nameservers y borra la anterior. El registrador
 * seguiría apuntando a los viejos y el dominio dejaría de resolver.
 *
 * Es exactamente lo que empezó a pasar el 1 de septiembre: al cambiar el nombre
 * a yalqui.com.co, el despliegue creó la zona nueva e intentó borrar esta. Falló
 * solo porque todavía tenía los registros de app.yalqui.com adentro.
 */
const zone = route53.HostedZone.fromHostedZoneAttributes(app, "ZonaYalqui", {
  hostedZoneId: "Z03098621QOWPITDO6FV4",
  zoneName: "yalqui.com",
});

/**
 * El dominio no va detrás de una bandera.
 *
 * El despliegue automático corre `cdk deploy --all` sin contexto extra, así que
 * cualquier condición que dependa de `-c` sería falsa ahí y el certificado, la
 * distribución de CloudFront y los registros DNS se borrarían en el siguiente
 * push. app.yalqui.com quedaría fuera de servicio sin que nadie lo pidiera.
 */
new InfraStack(app, "YalquiStack", {
  env,
  appDomain: "app.yalqui.com",
  zone,
});
