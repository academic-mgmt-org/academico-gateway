import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ReflectionService } from '@grpc/reflection';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);

  const grpcPort = process.env.GRPC_PORT || '50050';
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: ['catalogo.v1', 'auth.v1', 'notificaciones.v1'],
      protoPath: [
        join(__dirname, 'proto/catalogo/v1/catalogo.proto'),
        join(__dirname, 'proto/auth.proto'),
        join(__dirname, 'proto/notificaciones/v1/notificaciones.proto'),
      ],
      url: `0.0.0.0:${grpcPort}`,
      onLoadPackageDefinition: (pkg, server) => {
        new ReflectionService(pkg).addToServer(server);
      },
    },
  });

  await app.init();
  await app.startAllMicroservices();

  logger.log({
    context: 'Bootstrap',
    event: 'grpc_server_started',
    grpcPort,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    features: {
      grpc: true,
      http: false,
      rest: false,
    },
  }, `API Gateway gRPC escuchando en puerto ${grpcPort}`);
}

bootstrap();
