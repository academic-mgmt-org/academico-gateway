import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { EmailService } from '../gen/proto/notificaciones/v1/notificaciones_pb.js';
import { services } from '../config/services.config';

@Injectable()
export class NotificacionesGrpcClientService {
  client = null;

  constructor(@Inject(Logger) logger) {
    this.logger = logger;
  }

  onModuleInit() {
    const notificacionesConfig = services.notificaciones;

    if (!notificacionesConfig || !notificacionesConfig.baseUrl) {
      this.logger.warn({
        context: 'NotificacionesGrpcClientService',
        event: 'client_not_configured',
      }, 'NOTIFICACIONES_BASE_URL no configurada, cliente gRPC de notificaciones no inicializado');
      return;
    }

    const transport = createConnectTransport({
      baseUrl: notificacionesConfig.baseUrl,
      httpVersion: '2',
      interceptors: [
        (next) => async (req) => {
          req.header.set('x-api-key', notificacionesConfig.apiKey);
          return await next(req);
        },
      ],
    });

    this.client = createClient(EmailService, transport);

    this.logger.log({
      context: 'NotificacionesGrpcClientService',
      event: 'client_initialized',
      baseUrl: notificacionesConfig.baseUrl,
    }, `Cliente ConnectRPC de notificaciones inicializado -> ${notificacionesConfig.baseUrl}`);
  }

  async sendEmail(data = {}) {
    if (!this.client) {
      this.onModuleInit();
    }

    if (!this.client) {
      throw new Error('Cliente de notificaciones no inicializado');
    }

    this.logger.debug({
      context: 'NotificacionesGrpcClientService',
      event: 'send_email_request',
      toEmail: data.toEmail || data.to_email || '',
    }, '[Notificaciones] Solicitando SendEmail al microservicio');

    return this.client.sendEmail({
      usuarioId: data.usuarioId || data.usuario_id || '',
      toEmail: data.toEmail || data.to_email || '',
      toName: data.toName || data.to_name || '',
      subject: data.subject || '',
      plainText: data.plainText || data.plain_text || '',
      html: data.html || '',
      tipo: data.tipo || '',
      prioridad: data.prioridad || '',
      source: data.source || '',
      metadata: data.metadata || [],
    });
  }
}
