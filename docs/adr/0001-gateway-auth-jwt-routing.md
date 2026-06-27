# ADR 0001: Gateway centraliza validacion JWT y enrutamiento

Fecha: 2026-06-27
Estado: aceptada

## Contexto

El sistema academico esta separado en microservicios. El frontend necesita una entrada unica para autenticar usuarios y consumir servicios como login, usuarios, matriculas, calificaciones y solicitudes.

Sin una decision explicita, cada microservicio podria validar tokens por su cuenta o exponer rutas publicas directas. Eso aumenta duplicacion, dificulta cambios de seguridad y vuelve menos clara la operacion en produccion.

## Decision

Centralizar en `academico-gateway`:

- recepcion de requests externos;
- validacion de whitelist;
- validacion de JWT contra `academico-login`;
- cache de whitelist y validaciones en Redis;
- redireccion por prefijo de ruta hacia el microservicio destino;
- inyeccion de `x-api-key` para llamadas internas.

Mantener en `academico-login`:

- autenticacion de credenciales;
- emision de `accessToken` y `refreshToken`;
- validacion criptografica del JWT;
- publicacion de whitelist para rutas publicas.

## Consecuencias

Positivas:

- El frontend solo necesita conocer el gateway.
- La politica de acceso se aplica de forma consistente antes de llegar a los microservicios.
- La rotacion de reglas de seguridad se concentra en gateway y login.
- Redis reduce latencia y carga sobre `academico-login`.
- Los microservicios reciben requests ya controlados por el gateway y protegidos con API key interna.

Negativas:

- El gateway queda en el camino critico de todos los requests.
- Si `academico-login` no esta disponible y el token no esta cacheado, no se pueden validar nuevos accesos protegidos.
- La documentacion y las pruebas deben cubrir el contrato entre gateway y login para evitar regresiones.

## Alternativas consideradas

### Validar JWT localmente en cada microservicio

Rechazada por duplicar logica de seguridad, aumentar el costo de cambios y obligar a distribuir secretos o claves de validacion a mas servicios.

### Exponer cada microservicio directamente al frontend

Rechazada porque dispersa CORS, rate limiting, autenticacion y observabilidad en varios puntos de entrada.

### Validar JWT localmente en el gateway

Posible a futuro si se publica una clave de verificacion estable o JWKS. No se adopta ahora porque la implementacion actual mantiene la autoridad de validacion en `academico-login`.

## Referencias

- `docs/architecture/gateway-auth-routing.md`
- `academico-gateway/src/middleware/token.middleware.js`
- `academico-gateway/src/services/proxy.service.js`
- `academico-login/src/auth/auth.service.js`
