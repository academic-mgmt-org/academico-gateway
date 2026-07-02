# Changelog

## [0.1.0](https://github.com/academic-mgmt-org/academico-gateway/compare/academico-gateway-v0.0.1...academico-gateway-v0.1.0) (2026-07-02)


### Features

* add deployment stage to pipeline for automated container updates on personal server ([4681b86](https://github.com/academic-mgmt-org/academico-gateway/commit/4681b86ef8baf1f7ed51a385db86bac7e17e9135))
* add ForgotPassword gRPC method to AuthService ([8197b57](https://github.com/academic-mgmt-org/academico-gateway/commit/8197b57587753d0ebfaafca1a51517d280e02e17))
* add Notificaciones service configuration to deployment pipeline variables ([f98d9bb](https://github.com/academic-mgmt-org/academico-gateway/commit/f98d9bb04791d35382af625aa42b629c7073ac4e))
* add notifications service integration, improve health check redis ping, and enhance exception filter response handling ([c212da6](https://github.com/academic-mgmt-org/academico-gateway/commit/c212da638d6760615c0f46b575d98765143cebb1))
* add ResetPassword gRPC method and request message to AuthService ([542b204](https://github.com/academic-mgmt-org/academico-gateway/commit/542b2042e1f87765564b4bdfb7ad14f3d25c0c93))
* decouple auth routing to new login microservice and update configuration and documentation ([c4e9cf6](https://github.com/academic-mgmt-org/academico-gateway/commit/c4e9cf68cd1f5cae8e4e64c6cf92d1116b8bc94a))
* enable gRPC reflection service for catalogo-v1 via @grpc/reflection ([509da9e](https://github.com/academic-mgmt-org/academico-gateway/commit/509da9e8d029815ed357a78cdab3964917f2bd1f))
* generate Protobuf JavaScript definitions for Catalogo and Eliza services ([e28422c](https://github.com/academic-mgmt-org/academico-gateway/commit/e28422cb69384aff09620749dcb28ce36c483729))
* implement ConnectRPC ElizaService server endpoints ([f22d1cb](https://github.com/academic-mgmt-org/academico-gateway/commit/f22d1cbbb60d18a42fb4339a150144daaec9e904))
* implement gRPC email notification service with client, controller, and proto definitions ([9cda8df](https://github.com/academic-mgmt-org/academico-gateway/commit/9cda8df6bcb72437b555f09ab6750fcd0f80808d))
* implement gRPC service for catalog management with native gRPC server and ConnectRPC client proxying ([c5198c8](https://github.com/academic-mgmt-org/academico-gateway/commit/c5198c853b1850b6a10e3ef2a08ae484d477b53d))
* initialize API gateway project with Redis integration, rate limiting, and global exception handling ([ec0503f](https://github.com/academic-mgmt-org/academico-gateway/commit/ec0503f0fa8e4ef892d4cb6d09775133863c7b8a))
* integrate ElizaService Login functionality via gRPC and ConnectRPC client ([1a1b93f](https://github.com/academic-mgmt-org/academico-gateway/commit/1a1b93fdbd050cfbee0baad7d876008daac8a065))
* integrate login and notification services, improve redis health checks, and enhance error handling compatibility ([7ded612](https://github.com/academic-mgmt-org/academico-gateway/commit/7ded6122d79b7fe43669b942137846d39be1d681))
* migrate gateway to Fastify and implement native HTTP/2 proxying for microservices and gRPC routes ([d48ce99](https://github.com/academic-mgmt-org/academico-gateway/commit/d48ce99582e990ba6e17a1df40c5a6e7797dccad))
* pass curriculum filters through catalog grpc ([eaccbea](https://github.com/academic-mgmt-org/academico-gateway/commit/eaccbea2d64f6daf24e0388f5d5147d72da1d2c6))
* wrap gRPC errors in RpcException with custom status codes in login controller ([40519a7](https://github.com/academic-mgmt-org/academico-gateway/commit/40519a7c25d3b9e7b544ee93b63e935deaa147bb))


### Bug Fixes

* update gRPC service definition namespace and ensure client initialization before sending emails ([f9a49b0](https://github.com/academic-mgmt-org/academico-gateway/commit/f9a49b0c245f54f3d9ce0bea4c377af9dd53546f))
* update validation endpoint to v2 in token middleware ([82f4d2a](https://github.com/academic-mgmt-org/academico-gateway/commit/82f4d2acd01b3eb50d20e92125ad92d26eba4f9a))
