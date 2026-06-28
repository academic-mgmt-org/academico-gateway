import { Module, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule, Logger } from 'nestjs-pino';
import { APP_FILTER } from '@nestjs/core';
import { pinoLoggerConfig } from './config/pino-logger.config';
import { TokenMiddleware } from './middleware/token.middleware';
import { ProxyController } from './controller/proxy.controller';
import { HealthController } from './controller/health.controller';
import { services } from './config/services.config';
import { ProxyService } from './services/proxy.service';
import { RedisService } from './utils/redis.service';
import { SecurityHeadersMiddleware } from './middleware/security-headers-middleware';
import { RateLimitIpMiddleware } from './middleware/rate-limit-ip.middleware';
import { RateLimitUserMiddleware } from './middleware/rate-limit-user.middleware';
import { RateLimitUploadMiddleware } from './middleware/rate-limit-upload.middleware';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { AdminSecurityMiddleware } from './middleware/admin-security.middleware';
import { AdminController } from './controller/admin.controller';
import { ConnectMiddleware } from './middleware/connect.middleware';
import { GrpcCatalogoController } from './controller/grpc-catalogo.controller';
import { CatalogoGrpcClientService } from './services/catalogo-grpc-client.service';
import { GrpcElizaController } from './controller/grpc-eliza.controller';
import { ElizaGrpcClientService } from './services/eliza-grpc-client.service';
@Module({
  imports: [
  // ⚠️ IMPORTANTE: LoggerModule DEBE ir PRIMERO
  // Esto asegura que capture logs de otros módulos durante su inicialización
  LoggerModule.forRoot(pinoLoggerConfig), ConfigModule.forRoot({
    envFilePath: '.env',
    isGlobal: true
  })],
  // ⚠️ ORDEN IMPORTANTE: HealthController DEBE ir ANTES que ProxyController
  // Esto asegura que las rutas /api/* no sean capturadas por el comodín * de ProxyController
  controllers: [HealthController, AdminController, GrpcCatalogoController, GrpcElizaController],
  providers: [RedisService, Logger, CatalogoGrpcClientService, ElizaGrpcClientService,
  // ═══════════════════════════════════════════════════════════
  // FILTRO GLOBAL DE EXCEPCIONES
  // ═══════════════════════════════════════════════════════════
  // Intercepta TODAS las excepciones HTTP y devuelve respuestas
  // estructuradas y profesionales
  {
    provide: APP_FILTER,
    useClass: HttpExceptionFilter
  }],
  exports: [RedisService]
})
export class AppModule {
  constructor(
    @Inject(ConfigService) configService,
    @Inject(RedisService) redisService,
    @Inject(Logger) logger
  ) {
    this.configService = configService;
    this.redisService = redisService;
    this.logger = logger;
    this.loadServicesConfig();
  }
  async loadServicesConfig() {
    // Cargar configuración directamente desde variables de entorno
    // No es necesario cachear en Redis (las env vars ya están en memoria)
    services.login.baseUrl = this.configService.get('LOGIN_BASE_URL');
    services.login.apiKey = this.configService.get('LOGIN_API_KEY');
    services.usuarios.baseUrl = this.configService.get('USUARIOS_BASE_URL');
    services.usuarios.apiKey = this.configService.get('USUARIOS_API_KEY');
    services.calificaciones.baseUrl = this.configService.get('CALIFICACIONES_BASE_URL');
    services.calificaciones.apiKey = this.configService.get('CALIFICACIONES_API_KEY');
    services.catalogo.baseUrl = this.configService.get('CATALOGO_BASE_URL');
    services.catalogo.apiKey = this.configService.get('CATALOGO_API_KEY');
    services.matriculas.baseUrl = this.configService.get('MATRICULAS_BASE_URL');
    services.matriculas.apiKey = this.configService.get('MATRICULAS_API_KEY');
    services.solicitudes.baseUrl = this.configService.get('SOLICITUDES_BASE_URL');
    services.solicitudes.apiKey = this.configService.get('SOLICITUDES_API_KEY');
    services.notificaciones.baseUrl = this.configService.get('NOTIFICACIONES_BASE_URL');
    services.notificaciones.apiKey = this.configService.get('NOTIFICACIONES_API_KEY');
    this.logger.log({
      context: 'AppModule',
      event: 'services_config_loaded',
      source: 'env',
      servicesCount: Object.keys(services).length
    }, '✅ Configuración de microservicios académicos cargada desde .env');
  }
  configure(consumer) {
    // 0. ConnectRPC Middleware (para endpoints RPC de Eliza)
    consumer.apply(ConnectMiddleware).forRoutes('*');

    // ═══════════════════════════════════════════════════════════
    // ORDEN CRÍTICO DE MIDDLEWARES (NO CAMBIAR)
    // ═══════════════════════════════════════════════════════════
    // 1. Security Headers (primero, aplica headers de seguridad)
    // 2. Rate Limit IP (protege contra DDoS ANTES de validar token)
    // 3. Token Validation (valida autenticación y extrae identifier)
    // 4. Rate Limit User (control individual DESPUÉS de autenticar)
    // 5. Rate Limit Upload (control específico para uploads)
    // ═══════════════════════════════════════════════════════════

    // 1. Security Headers Middleware (aplicar a TODAS las rutas)
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');

    // 2-5. Otros middlewares (EXCLUIR rutas /api/* y RPC que son internas/públicas)
    consumer.apply(RateLimitIpMiddleware, TokenMiddleware, RateLimitUserMiddleware, RateLimitUploadMiddleware).exclude(
      '/api/health',
      '/api/ready',
      '/api/live',
      '/api/(.*)',
      '/eliza.v1.ElizaService/(.*)'
    ).forRoutes('*');

    // ═══════════════════════════════════════════════════════════
    // ADMIN SECURITY MIDDLEWARE
    // ═══════════════════════════════════════════════════════════
    // Protección de doble capa para endpoints administrativos:
    // 1. IP Whitelist: Solo IPs autorizadas (10.24.8.x, localhost)
    // 2. API Key: Header x-admin-key debe coincidir con ADMIN_API_KEY
    // 
    // Aplicado SOLO a rutas /admin/*
    // ═══════════════════════════════════════════════════════════
    consumer.apply(AdminSecurityMiddleware).forRoutes('admin/(.*)');
  }
}
