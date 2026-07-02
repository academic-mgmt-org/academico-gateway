import { config } from 'dotenv';
import { startGrpcProxyServer } from './proxy/grpc-proxy-server';

config();

async function bootstrap() {
  const grpcPort = process.env.GRPC_PORT || '50050';
  const { server } = await startGrpcProxyServer({
    port: grpcPort,
  });

  const shutdown = (signal) => {
    console.log(`[gRPC proxy] ${signal} recibido. Cerrando servidor...`);
    server.tryShutdown((error) => {
      if (error) {
        console.error('[gRPC proxy] Error al cerrar. Forzando shutdown.', error);
        server.forceShutdown();
        process.exit(1);
      }

      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('[gRPC proxy] Error al iniciar gateway.', error);
  process.exit(1);
});
