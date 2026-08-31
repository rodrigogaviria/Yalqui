# Despliegue de Yalqui en AWS

Monorepo con npm workspaces:

| Paquete | Rol |
|---|---|
| `backend` | API tRPC (Node 24). En producción corre como Lambda |
| `frontend` | App React + Vite. Build estático en S3 + CloudFront → `app.yalqui.com` |
| `infra` | AWS CDK (TypeScript) — define toda la infraestructura |

## Arquitectura

```
  app.yalqui.com  ──►  CloudFront
                          ├─ /*        → S3 (build del frontend)
                          └─ /trpc/*   → API Gateway (HttpApi) → Lambda (VPC, sin NAT)
                                                                   └─ RDS MySQL t4g.micro
```

Región `us-east-1`. Sin NAT Gateway — la Lambda solo necesita hablar con MySQL dentro de la VPC.
Credenciales de base de datos y secreto JWT en Secrets Manager, inyectados a la Lambda como
variables de entorno en tiempo de despliegue.

`yalqui.com` (el dominio raíz, sin subdominio) queda libre para otro uso (landing u otro
propósito) y no se toca con este despliegue — solo se despliega el subdominio `app.`.

> **Nota sobre los tres dominios:** la cuenta tiene registrados `yalqui.com`, `yalqui.com.co` y
> `yalqui.co`. Se definió `yalqui.com` como el dominio canónico para esta app. `yalqui.com.co`
> tenía una zona de Route 53 activa de un intento anterior (con nameservers distintos a los que
> usa este proyecto) — si no se está usando para nada, vale la pena limpiarla para evitar
> confusión futura.

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
ns-988.awsdns-59.net
ns-1577.awsdns-05.co.uk
ns-1318.awsdns-36.org
ns-334.awsdns-41.com
```

Estos se delegan desde GoDaddy (donde está registrado `yalqui.com`): panel del dominio →
DNS/Nameservers → **Custom nameservers** → pegar los 4 → guardar.

**Estado: delegación confirmada y propagada.** Verificado con:
```bash
dig +short NS yalqui.com @8.8.8.8
```
La respuesta coincide con los 4 nameservers de arriba — se puede continuar con A2.

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

Abrir `https://app.yalqui.com`.

> **Usuarios de acceso:** pendiente. Esta sección se completa cuando exista un modelo de
> autenticación real (tabla de usuarios, roles, seed de datos) — no antes. No se debe documentar
> aquí ningún usuario/contraseña de ejemplo hasta que ese sistema esté definido, y aun entonces,
> evaluar si conviene mantenerlos fuera de este archivo por seguridad.

---

## Parte B — CI/CD automático

**Estado: listo.** Cada `git push` a `main` dispara el despliegue solo, autenticado por OIDC
(sin llaves de larga duración en GitHub) — mismo patrón que FRUBA.

- Rol: `arn:aws:iam::934384776718:role/yalqui-github-deploy`, con trust policy limitada a
  `repo:rodrigogaviria/Yalqui:ref:refs/heads/main`.
- Permisos: asumir los roles de CDK (`arn:aws:iam::934384776718:role/cdk-*`) e invocar
  `yalqui-init-db`.
- Secreto en GitHub: `AWS_DEPLOY_ROLE_ARN` (Settings → Secrets and variables → Actions).
- Workflow: `.github/workflows/deploy.yml` — install → typecheck → build → asumir rol por OIDC →
  `cdk deploy --all` → invocar `yalqui-init-db` en modo `schema`.
- Actions está habilitado en el repo (Settings → Actions → General → *Allow all actions and
  reusable workflows*).

Para forzar una corrida manual sin necesidad de un push: pestaña **Actions** → *Deploy Yalqui* →
**Run workflow**.

---

## Comandos útiles

```bash
cd infra && npx cdk diff YalquiStack --profile yalqui   # ver cambios antes de desplegar
cd infra && npx cdk destroy --all --profile yalqui       # borrar todo (RDS queda como snapshot)
```

