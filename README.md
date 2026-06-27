# academico-gateway

API Gateway del Sistema de Gestion Academica.

Este servicio es el punto de entrada HTTP/gRPC para los microservicios academicos. Centraliza validacion de acceso, consulta de whitelist, rate limiting y redireccion de requests hacia servicios internos.

## Documentacion

La documentacion transversal del flujo de autenticacion y enrutamiento vive en este repositorio para mantenerla versionada junto al componente que orquesta el flujo:

- [Arquitectura gateway-auth-routing](docs/architecture/gateway-auth-routing.md)
- [ADR 0001: Gateway centraliza validacion JWT y enrutamiento](docs/adr/0001-gateway-auth-jwt-routing.md)

La carpeta `docs/` esta preparada para publicarse como Wiki de Azure DevOps usando la opcion de publicar Markdown desde un repositorio Git.

## Rol en la arquitectura

El gateway:

- Expone rutas por prefijo de microservicio, por ejemplo `/login/*`, `/usuarios/*`, `/matriculas/*`.
- Consulta la whitelist publica en `academico-login`.
- Valida JWT contra `academico-login`.
- Cachea whitelist y validaciones de token en Redis.
- Reenvia el request al microservicio destino quitando el prefijo del servicio.
- Agrega `x-api-key` interna al request redirigido.

## Configuracion

Ver [.env.example](.env.example) para la lista completa de variables.

Variables principales:

- `LOGIN_BASE_URL`
- `LOGIN_API_KEY`
- `USUARIOS_BASE_URL`
- `USUARIOS_API_KEY`
- `CALIFICACIONES_BASE_URL`
- `CATALOGO_BASE_URL`
- `MATRICULAS_BASE_URL`
- `SOLICITUDES_BASE_URL`
- `GATEWAY_TOKEN_CACHE_TTL`
- `GATEWAY_WHITELIST_CACHE_TTL`
- `REDIS_HOST`
- `REDIS_PORT`

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
