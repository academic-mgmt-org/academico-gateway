import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { config } from 'dotenv';
config();
async function bootstrap() {
  // ⚠️ CRÍTICO: bufferLogs = true
  // Esto permite que Pino capture logs ANTES de que el logger esté configurado
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false
  });

  // Configurar Pino como logger global
  // Esto reemplaza el logger por defecto de NestJS
  app.useLogger(app.get(Logger));

  // Obtener instancia del logger para uso en bootstrap
  const logger = app.get(Logger);

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
  const config = new DocumentBuilder().setTitle('API Gateway - Sistema de Gestión Académica').setDescription('Documentación del API Gateway para el Sistema de Gestión Académica').setVersion('1.0').addApiKey({
    type: 'apiKey',
    name: 'x-api-key',
    in: 'header'
  }, 'apiKey').build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Log estructurado de inicio
  logger.log({
    context: 'Bootstrap',
    event: 'application_started',
    port,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    features: {
      cors: true,
      websocket: false,
      swagger: true
    }
  }, `🚀 API Gateway corriendo en puerto ${port}`);
}
bootstrap();