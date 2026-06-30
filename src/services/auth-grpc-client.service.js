import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { AuthService } from '../gen/proto/auth_pb.js';
import { services } from '../config/services.config';

@Injectable()
export class AuthGrpcClientService {
  /** @type {import('@connectrpc/connect').Client<typeof AuthService>} */
  client = null;

  constructor(@Inject(Logger) logger) {
    this.logger = logger;
  }

  onModuleInit() {
    const loginConfig = services.login;

    if (!loginConfig || !loginConfig.baseUrl) {
      this.logger.warn({
        context: 'AuthGrpcClientService',
        event: 'client_not_configured',
      }, 'LOGIN_BASE_URL no configurada, cliente gRPC de Auth no inicializado');
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

    this.client = createClient(AuthService, transport);

    this.logger.log({
      context: 'AuthGrpcClientService',
      event: 'client_initialized',
      baseUrl: loginConfig.baseUrl,
    }, `Cliente ConnectRPC de Auth inicializado -> ${loginConfig.baseUrl}`);
  }

  async login(data = {}) {
    if (!this.client) {
      throw new Error('Cliente de Auth no inicializado');
    }

    this.logger.debug({
      context: 'AuthGrpcClientService',
      event: 'login_request',
      username: data.username || '',
    }, `[Auth] Solicitando Login usuario=${data.username || ''} al microservicio`);

    return this.client.login({
      username: data.username || '',
      password: data.password || '',
      appVersion: data.appVersion || data.app_version || '',
      passwordEncoding: data.passwordEncoding || data.password_encoding || '',
    });
  }

  async refreshToken(data = {}) {
    if (!this.client) {
      throw new Error('Cliente de Auth no inicializado');
    }

    this.logger.debug({
      context: 'AuthGrpcClientService',
      event: 'refresh_token_request',
    }, '[Auth] Solicitando RefreshToken al microservicio');

    return this.client.refreshToken({
      refreshToken: data.refreshToken || data.refresh_token || '',
    });
  }

  async forgotPassword(data = {}) {
    if (!this.client) {
      throw new Error('Cliente de Auth no inicializado');
    }

    this.logger.debug({
      context: 'AuthGrpcClientService',
      event: 'forgot_password_request',
      email: data.email || '',
    }, '[Auth] Solicitando ForgotPassword al microservicio');

    return this.client.forgotPassword({
      email: data.email || '',
    });
  }

  async logout(data = {}) {
    if (!this.client) {
      throw new Error('Cliente de Auth no inicializado');
    }

    this.logger.debug({
      context: 'AuthGrpcClientService',
      event: 'logout_request',
    }, '[Auth] Solicitando Logout al microservicio');

    return this.client.logout({
      token: data.token || '',
      refreshToken: data.refreshToken || data.refresh_token || '',
    });
  }
}
