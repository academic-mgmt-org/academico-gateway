import { Module, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule, Logger } from 'nestjs-pino';
import { pinoLoggerConfig } from './config/pino-logger.config';
import { services } from './config/services.config';

@Module({
  imports: [
    LoggerModule.forRoot(pinoLoggerConfig),
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
  ],
  controllers: [],
  providers: [
    Logger,
  ],
})
export class AppModule {
  constructor(
    @Inject(ConfigService) configService,
    @Inject(Logger) logger,
  ) {
    this.configService = configService;
    this.logger = logger;
    this.loadServicesConfig();
  }

  loadServicesConfig() {
    services.login.baseUrl = this.configService.get('LOGIN_BASE_URL');
    services.login.apiKey = this.configService.get('LOGIN_API_KEY');
    services.catalogo.baseUrl = this.configService.get('CATALOGO_BASE_URL');
    services.catalogo.apiKey = this.configService.get('CATALOGO_API_KEY');
    services.notificaciones.baseUrl = this.configService.get('NOTIFICACIONES_BASE_URL');
    services.notificaciones.apiKey = this.configService.get('NOTIFICACIONES_API_KEY');

    this.logger.log({
      context: 'AppModule',
      event: 'services_config_loaded',
      source: 'env',
      servicesCount: Object.keys(services).length,
    }, 'Configuracion de microservicios academicos cargada desde .env');
  }
}
