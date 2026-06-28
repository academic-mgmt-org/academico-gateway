import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ReflectionService } from '@grpc/reflection';
import httpProxy from '@fastify/http-proxy';
import replyFrom from '@fastify/reply-from';
import { services } from './config/services.config';
import { config } from 'dotenv';
config();
async function bootstrap() {
  // ⚠️ CRÍTICO: bufferLogs = true
  // Esto permite que Pino capture logs ANTES de que el logger esté configurado
  const app = await NestFactory.create(
    AppModule,
    new FastifyAdapter({
      http2: true
    }),
    {
      bufferLogs: true,
      bodyParser: false
    }
  );

  const fastifyInstance = app.getHttpAdapter().getInstance();
  const logger = app.get(Logger);

  // Registrar proxy nativo de Fastify para cada microservicio
  const microservices = ['login', 'usuarios', 'calificaciones', 'catalogo', 'matriculas', 'solicitudes', 'notificaciones'];
  for (const name of microservices) {
    const serviceConfig = services[name];
    if (serviceConfig && serviceConfig.baseUrl) {
      await fastifyInstance.register(httpProxy, {
        upstream: serviceConfig.baseUrl,
        prefix: `/${name}`,
        http2: true,
        replyOptions: {
          rewriteRequestHeaders: (originalReq, headers) => {
            return {
              ...headers,
              'x-api-key': serviceConfig.apiKey
            };
          }
        }
      });
      logger.log(`[Proxy] Native HTTP/2 proxy registered for /${name} -> ${serviceConfig.baseUrl}`);
    }
  }
  // Registrar proxy para rutas gRPC/ConnectRPC directas (paquetes con puntos como catalogo.v1.CatalogoService)
  // NOTA: @fastify/http-proxy no soporta prefixes con puntos (.) correctamente,
  // por lo que usamos @fastify/reply-from con rutas explícitas.
  const grpcServiceMap = {
    'catalogo.v1.CatalogoService': services.catalogo,
    'eliza.v1.ElizaService': services.login,
    'notificaciones.v1.NotificationService': services.notificaciones,
  };

  for (const [packagePath, serviceConfig] of Object.entries(grpcServiceMap)) {
    if (!serviceConfig || !serviceConfig.baseUrl) continue;

    // Cada servicio gRPC se registra en su propio scope encapsulado
    // para poder tener un @fastify/reply-from con un `base` diferente
    await fastifyInstance.register(async function grpcProxyPlugin(fastify) {
      // Agregar content-type parser para application/grpc
      // Fastify no reconoce este content-type por defecto y devuelve 415
      fastify.addContentTypeParser('application/grpc', function (request, payload, done) {
        const chunks = [];
        payload.on('data', chunk => chunks.push(chunk));
        payload.on('end', () => done(null, Buffer.concat(chunks)));
        payload.on('error', done);
      });

      await fastify.register(replyFrom, {
        base: serviceConfig.baseUrl,
        http2: true,
      });

      // Registrar ruta para cada método gRPC (e.g., /catalogo.v1.CatalogoService/ListarMaterias)
      fastify.all(`/${packagePath}/:method`, async (request, reply) => {
        const targetPath = `/${packagePath}/${request.params.method}`;
        logger.debug(`[gRPC Proxy] ${request.method} ${targetPath} -> ${serviceConfig.baseUrl}${targetPath}`);
        return reply.from(targetPath, {
          rewriteRequestHeaders: (originalReq, headers) => {
            return {
              ...headers,
              'x-api-key': serviceConfig.apiKey
            };
          }
        });
      });

      logger.log(`[Proxy] gRPC route registered: /${packagePath}/* -> ${serviceConfig.baseUrl}`);
    });
  }

  // Configurar Pino como logger global
  // Esto reemplaza el logger por defecto de NestJS
  app.useLogger(app.get(Logger));

  // Obtener instancia del logger para uso en bootstrap

  // 🔧 PREVENCIÓN DE MEMORY LEAK: Incrementar límite de EventEmitters
  // Esto previene warnings cuando hay múltiples proxies activos
  const httpServer = app.getHttpServer();
  if (httpServer && typeof httpServer.setMaxListeners === 'function') {
    httpServer.setMaxListeners(50); // Por defecto es 10
    logger.debug({
      context: 'Bootstrap',
      event: 'max_listeners_configured',
      maxListeners: 50
    }, '[Configuración] Max listeners del servidor HTTP configurado a 50');
  }

  // ═══════════════════════════════════════════════════════════
  // CONFIGURACIÓN CORS (Cross-Origin Resource Sharing)
  // ═══════════════════════════════════════════════════════════
  // IMPORTANTE: Validación estricta de orígenes permitidos
  // Si CORS_ORIGIN está vacío, RECHAZA todas las peticiones de navegadores
  const corsOrigin = process.env.CORS_ORIGIN || '';
  const allowedOrigins = corsOrigin ? corsOrigin.split(',').map(origin => origin.trim()).filter(origin => origin !== '') : [];

  // Logging de configuración CORS al iniciar
  if (allowedOrigins.length === 0) {
    logger.warn({
      context: 'Bootstrap',
      event: 'cors_not_configured'
    }, '⚠️ CORS_ORIGIN no configurado - solo apps móviles (sin Origin header) podrán acceder');
  } else {
    logger.log({
      context: 'Bootstrap',
      event: 'cors_configured',
      allowedOrigins
    }, `✅ CORS habilitado para: ${allowedOrigins.join(', ')}`);
  }
  app.enableCors({
    origin: (origin, callback) => {
      // CASO 1: Sin header Origin (apps móviles, Postman, cURL)
      // Las apps móviles nativas NO envían Origin, permitirlas
      if (!origin) {
        logger.debug({
          context: 'CORS',
          event: 'no_origin_header'
        }, '✅ Petición sin Origin header (app móvil) - permitida');
        callback(null, true);
        return;
      }

      // CASO 2: Con header Origin (navegadores web)
      // Validar contra whitelist de CORS_ORIGIN
      if (allowedOrigins.includes(origin)) {
        logger.debug({
          context: 'CORS',
          event: 'origin_allowed',
          origin
        }, `✅ Origin permitido: ${origin}`);
        callback(null, true);
      } else {
        logger.warn({
          context: 'CORS',
          event: 'origin_blocked',
          origin,
          allowedOrigins
        }, `🚫 Origin bloqueado: ${origin}`);
        callback(new Error(`CORS: Origin ${origin} no permitido`));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,x-api-key'
  });

  // Configuración de Swagger
  const swaggerConfig = new DocumentBuilder().setTitle('API Gateway - Sistema de Gestión Académica').setDescription('Documentación del API Gateway para el Sistema de Gestión Académica').setVersion('1.0').addApiKey({
    type: 'apiKey',
    name: 'x-api-key',
    in: 'header'
  }, 'apiKey').build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  // ═══════════════════════════════════════════════════════════
  // SERVIDOR gRPC NATIVO (puerto 50050)
  // ═══════════════════════════════════════════════════════════
  // El gateway ahora actúa como servidor gRPC real usando @grpc/grpc-js.
  // Esto permite que clientes gRPC (grpcurl, otros servicios) se conecten
  // directamente al gateway con el protocolo gRPC nativo completo
  // (incluidos HTTP/2 trailers: grpc-status, grpc-message).
  //
  // Flujo:
  //   grpcurl → Gateway:50050 (gRPC) → GrpcCatalogoController
  //     → CatalogoGrpcClientService (ConnectRPC) → academico-catalogo:3003
  // ═══════════════════════════════════════════════════════════
  const grpcPort = process.env.GRPC_PORT || '50050';
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: ['catalogo.v1', 'eliza.v1'],
      protoPath: [
        join(__dirname, 'proto/catalogo/v1/catalogo.proto'),
        join(__dirname, 'proto/eliza.proto'),
      ],
      url: `0.0.0.0:${grpcPort}`,
      onLoadPackageDefinition: (pkg, server) => {
        new ReflectionService(pkg).addToServer(server);
      },
    },
  });

  // Iniciar todos los microservicios (gRPC) antes de escuchar HTTP
  await app.startAllMicroservices();
  logger.log({
    context: 'Bootstrap',
    event: 'grpc_server_started',
    port: grpcPort,
  }, `🔌 Servidor gRPC nativo escuchando en puerto ${grpcPort}`);

  // Iniciar servidor HTTP/2 (Fastify)
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  // Log estructurado de inicio
  logger.log({
    context: 'Bootstrap',
    event: 'application_started',
    httpPort: port,
    grpcPort,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    features: {
      cors: true,
      websocket: false,
      swagger: true,
      grpc: true
    }
  }, `🚀 API Gateway corriendo — HTTP: ${port} | gRPC: ${grpcPort}`);
}
bootstrap();
