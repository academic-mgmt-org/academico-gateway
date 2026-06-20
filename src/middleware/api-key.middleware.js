import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
@Injectable()
export class ApiKeyMiddleware {
  constructor(@Inject(ConfigService) configService, @Inject(Logger) logger) {
    this.configService = configService;
    this.logger = logger;
    this.validApiKeys = (this.configService.get('API_KEYS') || '').split(',');
  }
  use(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !this.validApiKeys.includes(apiKey)) {
      this.logger.warn({
        context: 'ApiKeyMiddleware',
        event: 'invalid_api_key',
        ip: req.ip,
        url: req.originalUrl
      }, '[Security] Solicitud con API Key inválida o ausente');
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'API Key inválida o ausente'
      });
    }
    this.logger.log({
      context: 'ApiKeyMiddleware',
      event: 'api_key_authorized'
      // apiKey se redactará automáticamente por la configuración de Pino
    }, '[Security] Solicitud autorizada con API Key');
    next();
  }
}