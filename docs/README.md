# Documentacion tecnica

Esta carpeta es la fuente versionada de documentacion tecnica del gateway. Esta pensada para publicarse como Wiki de Azure DevOps desde el repositorio Git.

## Contenido

- [Arquitectura gateway-auth-routing](architecture/gateway-auth-routing.md)
- [ADR 0001: Gateway centraliza validacion JWT y enrutamiento](adr/0001-gateway-auth-jwt-routing.md)

## Politica de mantenimiento

- Los cambios de arquitectura se revisan por pull request.
- Las decisiones relevantes se registran como ADR en `docs/adr/`.
- Los README de cada repositorio deben enlazar a esta documentacion cuando participen en el flujo.
- Los documentos deben describir comportamiento observable y apuntar a los archivos de codigo que lo implementan.

## Publicacion en Azure DevOps

Configuracion recomendada:

- Tipo: Publish code as wiki.
- Repositorio: `academico-gateway`.
- Rama: rama estable del proyecto, por ejemplo `main`.
- Carpeta: `/docs`.
- Pagina inicial: `README.md`.

Los archivos `.order` controlan el orden de navegacion de la Wiki publicada.
