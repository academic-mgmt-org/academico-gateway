import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { ElizaService } from '../gen/eliza_pb.js';
import { services } from '../config/services.config';

/**
 * Cliente gRPC/ConnectRPC para el microservicio academico-login (ElizaService).
 * 
 * Usa el protocolo Connect (HTTP/2) para comunicarse con el microservicio,
 * que a su vez usa fastifyConnectPlugin.
 */
@Injectable()
export class ElizaGrpcClientService {
  /** @type {import('@connectrpc/connect').Client<typeof ElizaService>} */
  client = null;

  constructor(@Inject(Logger) logger) {
    this.logger = logger;
  }

  onModuleInit() {
    const loginConfig = services.login;

    if (!loginConfig || !loginConfig.baseUrl) {
      this.logger.warn({
        context: 'ElizaGrpcClientService',
        event: 'client_not_configured',
      }, '⚠️ LOGIN_BASE_URL no configurada, cliente gRPC de Eliza no inicializado');
      return;
    }

    const transport = createConnectTransport({
      baseUrl: loginConfig.baseUrl,
      httpVersion: '2',
      interceptors: [
        (next) => async (req) => {
          req.header.set('x-api-key', loginConfig.apiKey);
          return await next(req);
        },
      ],
    });

    this.client = createClient(ElizaService, transport);

    this.logger.log({
      context: 'ElizaGrpcClientService',
      event: 'client_initialized',
      baseUrl: loginConfig.baseUrl,
    }, `✅ Cliente ConnectRPC de Eliza inicializado -> ${loginConfig.baseUrl}`);
  }

  /**
   * Método Say.
   * @param {{ sentence?: string }} data
   * @returns {Promise<{ sentence: string }>}
   */
  async say(data = {}) {
    if (!this.client) {
      throw new Error('Cliente de Eliza no inicializado');
    }

    this.logger.debug({
      context: 'ElizaGrpcClientService',
      event: 'say_request',
      sentence: data.sentence || '',
    }, '[Eliza] Solicitando Say al microservicio');

    const response = await this.client.say({
      sentence: data.sentence || '',
    });

    return response;
  }

  /**
   * Método Login.
   * @param {{ username?: string, password?: string, appVersion?: string }} data
   * @returns {Promise<{ accessToken: string, refreshToken: string, mfaRequired: boolean, requiresAppUpdate: boolean }>}
   */
  async login(data = {}) {
    if (!this.client) {
      throw new Error('Cliente de Eliza no inicializado');
    }

    this.logger.debug({
      context: 'ElizaGrpcClientService',
      event: 'login_request',
      username: data.username || '',
    }, `[Eliza] Solicitando Login usuario=${data.username || ''} al microservicio`);

    const response = await this.client.login({
      username: data.username || '',
      password: data.password || '',
      appVersion: data.appVersion || data.app_version || '',
    });

    return response;
  }
}
