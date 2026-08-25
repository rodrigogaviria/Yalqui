# Yalqui
Yalqui


Aplicación serverless en AWS: frontend en React servido por S3+CloudFront, backend con tRPC en Lambda expuesto vía API Gateway, base de datos RDS MySQL.

## Arquitectura

```
Navegador → CloudFront → /*        → S3 (frontend estático)
                        → /trpc/*  → API Gateway → Lambda (tRPC) → RDS MySQL
```

La infraestructura completa se define como código (CDK) en `/infra` y se despliega mediante `cdk deploy`. No se crean recursos manualmente en la consola de AWS.

## Estructura de carpetas

```
.
├── frontend/   # React + Vite + TypeScript. Build estático servido por S3/CloudFront.
├── backend/    # Lógica de la API (tRPC). Se empaqueta como función Lambda.
└── infra/      # Infraestructura como código (AWS CDK). Define Lambda, API Gateway,
                # y (pendiente) RDS, VPC, S3, CloudFront.
```

## Requisitos previos

- Node.js 18+ (recomendado usar [nvm](https://github.com/nvm-sh/nvm))
- AWS CLI configurado (`aws configure` o `aws configure sso`) con acceso a la cuenta destino
- AWS CDK CLI: `npm install -g aws-cdk`
- Cuenta de AWS con **CDK bootstrap** ya ejecutado en la región destino (ver sección Despliegue)

## Cómo correr en local

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Levanta el servidor de desarrollo de Vite (por defecto en `http://localhost:5173`).

### Backend
```bash
cd backend
npm install
npx tsx src/test-local.ts
```
Ejecuta el router de tRPC directamente en local, sin necesidad de Lambda ni AWS, simulando llamadas a los endpoints definidos en `src/router.ts`.

### Infraestructura (validar sin desplegar)
```bash
cd infra
npm install
npx cdk synth
```
Genera la plantilla de CloudFormation localmente, sin tocar ninguna cuenta de AWS. Útil para validar que el código de infraestructura es correcto antes de desplegar.

## Antes de desplegar por primera vez

Estos son los pasos y datos pendientes de completar con las credenciales/cuenta reales:

- [ ] Confirmar la cuenta de AWS y región a usar (`AWS_REGION`)
- [ ] Ejecutar `cdk bootstrap aws://ACCOUNT-ID/REGION` una sola vez por cuenta/región (si no se ha hecho ya)
- [ ] Definir si se reutiliza la VPC/RDS de un proyecto existente o se crean nuevos
- [ ] Completar las variables de entorno pendientes en `infra/lib/infra-stack.ts` (marcadas con `TODO`):
  - Connection string de la base de datos (RDS)
  - ARN del secreto JWT en Secrets Manager
- [ ] Configurar el dominio en Route 53 (si aplica)
- [ ] Confirmar si el rol OIDC de GitHub Actions ya tiene permisos sobre este repositorio, en caso de usar despliegue automatizado

## Despliegue

```bash
cd infra
npx cdk deploy
```

Esto crea/actualiza los recursos definidos en el stack en la cuenta de AWS configurada localmente (vía AWS CLI/SSO). Al finalizar, imprime en terminal la URL pública del API Gateway (`ApiUrl`).

## Desarrollo con Claude Code

Este proyecto está pensado para desarrollarse con [Claude Code](https://docs.claude.com/en/docs/claude-code) desde VS Code. Para conectarlo contra AWS Bedrock como backend del modelo:

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1   # ajustar según la región del proyecto
claude
```

Requiere que el modelo Claude esté habilitado en el *Model catalog* de Bedrock en la cuenta de AWS, y credenciales locales configuradas (SSO o llaves).

## Pendiente / próximos pasos

- Agregar stack de CDK para frontend (S3 + CloudFront + Route 53)
- Agregar stack de CDK para base de datos (RDS MySQL + VPC)
- Definir esquema inicial de base de datos y Lambda `init-db`
- Configurar workflow de GitHub Actions para despliegue automatizado (CDK deploy vía OIDC)
