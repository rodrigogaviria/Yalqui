# Despliegue de Yalqui en AWS

Monorepo con npm workspaces:

| Paquete | Rol |
|---|---|
| `backend` | API tRPC (Node 24). En producción corre como Lambda |
| `frontend` | App React + Vite. Build estático en S3 + CloudFront → `app.yalqui.com.co` |
| `infra` | AWS CDK (TypeScript) — define toda la infraestructura |

## Arquitectura

```
  app.yalqui.com.co  ──►  CloudFront
                          ├─ /*        → S3 (build del frontend)
                          └─ /trpc/*   → API Gateway (HttpApi) → Lambda (VPC, sin NAT)
                                                                   └─ RDS MySQL t4g.micro
```

Región `us-east-1`. Sin NAT Gateway — la Lambda solo necesita hablar con MySQL dentro de la VPC.
Credenciales de base de datos y secreto JWT en Secrets Manager, inyectados a la Lambda como
variables de entorno en tiempo de despliegue.

`yalqui.com.co` (el dominio raíz, sin subdominio) queda reservado para la landing existente y
no se toca con este despliegue.

---

## Antes de empezar

- Node 24 (revisar `.nvmrc` si existe, o `nvm use 24`)
- AWS CLI v2 instalada
- Cuenta de AWS: **`934384776718`** — la misma cuenta donde corre el proyecto FRUBA. Al desplegar
  cualquier recurso nuevo, verificar que el nombre no choque con algo existente de ese proyecto.

Desde la raíz del repo:
```bash
npm install
```
Instala los tres workspaces y genera `package-lock.json` en la raíz. Ese lockfile debe quedar
commiteado — CDK lo usa (`depsLockFilePath`) para empaquetar las Lambdas.

### Perfil de AWS local

```bash
aws configure --profile yalqui
aws sts get-caller-identity --profile yalqui
```

Para no repetir `--profile` en cada comando:
```bash
export AWS_PROFILE=yalqui
export AWS_REGION=us-east-1
```

> **Bootstrap de CDK:** no hace falta correrlo — la cuenta ya está bootstrapeada (se hizo para
> FRUBA, y el bootstrap es por cuenta/región, no por proyecto). Se puede confirmar con:
> `aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1`

---

## Parte A — Primer despliegue (manual)

### A1. Zona DNS

```bash
cd infra
npx cdk deploy YalquiDnsStack
```

**Estado: ya desplegado.** Nameservers generados:
```
ns-487.awsdns-60.com
ns-557.awsdns-05.net
ns-1942.awsdns-50.co.uk
ns-1451.awsdns-53.org
```

Estos se delegan desde GoDaddy (donde está registrado `yalqui.com.co`): panel del dominio →
DNS/Nameservers → **Custom nameservers** → pegar los 4 → guardar. La propagación puede tardar
entre 10 minutos y varias horas.

Verificar cuándo ya propagó:
```bash
dig +short NS yalqui.com.co @8.8.8.8
```
Cuando la respuesta coincida exactamente con los 4 nameservers de arriba, se puede continuar con A2.

> A diferencia del proceso de FRUBA, aquí quien controla la cuenta de GoDaddy es el propio
> cliente — el cambio de nameservers lo hace directamente, no el desarrollador.

### A2. Stack principal

Requiere que la propagación de A1 ya haya terminado (el certificado ACM se valida por DNS y el
deploy queda esperando indefinidamente si el dominio aún resuelve hacia GoDaddy).

```bash
# desde la raíz del repo
npm run build --workspace=frontend

cd infra
npx cdk deploy YalquiStack
```

Tarda entre 15 y 20 minutos — la mayor parte es el aprovisionamiento de RDS. Al terminar quedan
disponibles los outputs `SiteUrl`, `ApiEndpoint`, `DbEndpoint`, `InitDbFunctionName`.

### A3. Inicializar la base de datos

```bash
aws lambda invoke \
  --function-name yalqui-init-db \
  --region us-east-1 --profile yalqui \
  --cli-binary-format raw-in-base64-out \
  --payload '{"mode":"all"}' \
  init-out.json
cat init-out.json
```

Aplica el esquema definido en `backend/sql/schema.sql`. Hoy ese esquema solo trae una tabla
placeholder (`app_meta`) para validar que la tubería completa funciona de punta a punta — el
modelo de datos real (inmuebles, arrendatarios, contratos, pagos) se construye después,
directamente con Claude Code, extendiendo `backend/src/db/schema.ts` y `backend/sql/schema.sql`
con el mismo patrón. No hace falta tocar infraestructura para eso: la Lambda `yalqui-init-db`
ya queda lista para aplicar cualquier esquema nuevo que se agregue ahí.

### A4. Verificar

Abrir `https://app.yalqui.com.co`.

> **Usuarios de acceso:** pendiente. Esta sección se completa cuando exista un modelo de
> autenticación real (tabla de usuarios, roles, seed de datos) — no antes. No se debe documentar
> aquí ningún usuario/contraseña de ejemplo hasta que ese sistema esté definido, y aun entonces,
> evaluar si conviene mantenerlos fuera de este archivo por seguridad.

---

## Parte B — CI/CD automático (pendiente de construir)

FRUBA despliega automáticamente en cada `git push` a `main`, autenticado por OIDC (sin llaves
de larga duración en GitHub). Yalqui todavía no tiene este pipeline — hoy todo despliegue es
manual, con los comandos de la Parte A. El proveedor OIDC de GitHub ya existe en esta cuenta
(fue creado para FRUBA y es un recurso a nivel de cuenta, no de proyecto), así que falta
únicamente lo específico de este repositorio:

1. Crear un rol IAM propio (ej. `yalqui-github-deploy`), con trust policy apuntando a
   `repo:rodrigogaviria/Yalqui:ref:refs/heads/main` — **no reutilizar** el rol de FRUBA, el suyo
   solo confía en su propio repositorio.
2. Adjuntarle permiso para asumir los roles que CDK generó en el bootstrap
   (`arn:aws:iam::934384776718:role/cdk-*`) y para invocar `yalqui-init-db`.
3. Guardar el ARN de ese rol como secreto `AWS_DEPLOY_ROLE_ARN` en GitHub
   (Settings → Secrets and variables → Actions).
4. Escribir `.github/workflows/deploy.yml`: install → typecheck → build → asumir rol por OIDC →
   `cdk deploy --all` → invocar `yalqui-init-db` en modo `schema`.

Hasta que esto exista, cualquier cambio de infraestructura o de esquema se aplica corriendo los
comandos de la Parte A a mano.

---

## Comandos útiles

```bash
cd infra && npx cdk diff YalquiStack --profile yalqui   # ver cambios antes de desplegar
cd infra && npx cdk destroy --all --profile yalqui       # borrar todo (RDS queda como snapshot)
```

## Costos estimados

Mismo perfil de arquitectura que FRUBA — números de referencia:

| Servicio | Primer año (free tier) | Después |
|---|---|---|
| RDS MySQL t4g.micro + 20 GB | $0 | ~$13.70/mes |
| Lambda (API + init) | $0 | ~$0 |
| API Gateway (HttpApi) | $0 | ~$0.10 |
| S3 + CloudFront | $0 | ~$0.05 |
| Secrets Manager (2 secretos) | ~$0.80 | ~$0.80 |
| **Total aprox.** | **~$0–1/mes** | **~$14–15/mes** |

Palanca principal para bajarlo después del primer año: Reserved Instance de RDS (~$7/mes).

## Pendiente

- Delegación de nameservers en GoDaddy (bloquea A2)
- Rol OIDC + workflow de GitHub Actions específicos de Yalqui (Parte B completa)
- Modelo de datos real: inmuebles, arrendatarios, contratos, pagos — se construye con Claude
  Code sobre `backend/src/db/schema.ts`, extendiendo el patrón ya dejado en `app_meta`
- Sistema de autenticación y usuarios reales (hoy no existe `auth` en el backend, a diferencia
  de FRUBA)