# academico-gateway

Gateway gRPC del Sistema de Gestion Academica.

Este servicio es el punto de entrada gRPC para los microservicios academicos. Expone servicios gRPC nativos y reenvia las llamadas a los servicios internos configurados.

## Documentacion

La documentacion transversal del flujo de autenticacion y enrutamiento vive en este repositorio para mantenerla versionada junto al componente que orquesta el flujo:

- [Arquitectura gateway-auth-routing](docs/architecture/gateway-auth-routing.md)
- [ADR 0001: Gateway centraliza validacion JWT y enrutamiento](docs/adr/0001-gateway-auth-jwt-routing.md)

La carpeta `docs/` esta preparada para publicarse como Wiki de Azure DevOps usando la opcion de publicar Markdown desde un repositorio Git.

## Rol en la arquitectura

El gateway:

- Expone servicios gRPC nativos mediante un proxy transparente.
- Reenvia `auth.v1.*` hacia `academico-login`.
- Reenvia `catalogo.v1.*` hacia `academico-catalogo`.
- Reenvia `notificaciones.v1.*` hacia `academico-notificaciones`, incluyendo
  `NotificationService`, `EmailService` y `HealthService`.
- Agrega `x-api-key` interna al request reenviado y no confia en la API key
  enviada por el cliente.
- No registra rutas REST, Connect/HTTP, Swagger ni health HTTP.

## Configuracion

Ver [.env.example](.env.example) para la lista completa de variables.

Variables principales:

- `LOGIN_BASE_URL`
- `LOGIN_API_KEY`
- `CATALOGO_BASE_URL`
- `CATALOGO_API_KEY`
- `NOTIFICACIONES_BASE_URL`
- `NOTIFICACIONES_API_KEY`
- `GRPC_PORT`

## Ejecucion local

```bash
npm install
npm run start:dev
```

## Pruebas

```bash
npm test
npm run test:e2e
npm run test:cov
```
