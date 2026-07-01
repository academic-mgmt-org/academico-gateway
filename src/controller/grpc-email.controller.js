import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { NotificacionesGrpcClientService } from '../services/notificaciones-grpc-client.service';

@Controller()
export class GrpcEmailController {
  constructor(
    @Inject(NotificacionesGrpcClientService) notificacionesClient,
    @Inject(Logger) logger,
  ) {
    this.notificacionesClient = notificacionesClient;
    this.logger = logger;
  }

  @GrpcMethod('notificaciones.v1.EmailService', 'SendEmail')
  async sendEmail(data) {
    this.logger.log({
      context: 'GrpcEmailController',
      event: 'send_email_call',
      toEmail: data?.toEmail || data?.to_email || null,
    }, '[gRPC] SendEmail llamado');

    try {
      const response = await this.notificacionesClient.sendEmail(data || {});

      this.logger.log({
        context: 'GrpcEmailController',
        event: 'send_email_success',
        toEmail: data?.toEmail || data?.to_email || null,
      }, '[gRPC] SendEmail exitoso');

      return {
        success: Boolean(response.success),
        message: response.message || '',
        provider: response.provider || '',
        messageId: response.messageId || response.message_id || '',
        message_id: response.messageId || response.message_id || '',
      };
    } catch (error) {
      this.logger.error({
        context: 'GrpcEmailController',
        event: 'send_email_error',
        toEmail: data?.toEmail || data?.to_email || null,
        error: error.message,
      }, `[gRPC] Error en SendEmail: ${error.message}`);

      throw new RpcException({
        code: error.code !== undefined ? error.code : 13,
        message: error.rawMessage || error.message,
      });
    }
  }
}
