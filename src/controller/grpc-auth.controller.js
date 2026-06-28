import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AuthGrpcClientService } from '../services/auth-grpc-client.service';

@Controller()
export class GrpcAuthController {
  constructor(
    @Inject(AuthGrpcClientService) authClient,
    @Inject(Logger) logger,
  ) {
    this.authClient = authClient;
    this.logger = logger;
  }

  @GrpcMethod('AuthService', 'Login')
  async login(data) {
    this.logger.log({
      context: 'GrpcAuthController',
      event: 'login_call',
      username: data?.username || null,
    }, `[gRPC] Login llamado para usuario=${data?.username || null}`);

    try {
      const response = await this.authClient.login({
        username: data?.username,
        password: data?.password,
        appVersion: data?.appVersion || data?.app_version,
        passwordEncoding: data?.passwordEncoding || data?.password_encoding,
      });

      this.logger.log({
        context: 'GrpcAuthController',
        event: 'login_success',
        username: data?.username || null,
      }, `[gRPC] Login exitoso para usuario=${data?.username || null}`);

      return {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        mfaRequired: response.mfaRequired,
        requiresAppUpdate: response.requiresAppUpdate,
        tokenType: response.tokenType,
        expiresIn: response.expiresIn,
        sessionId: response.sessionId,
        access_token: response.accessToken,
        refresh_token: response.refreshToken,
        mfa_required: response.mfaRequired,
        requires_app_update: response.requiresAppUpdate,
        token_type: response.tokenType,
        expires_in: response.expiresIn,
        session_id: response.sessionId,
      };
    } catch (error) {
      this.logger.error({
        context: 'GrpcAuthController',
        event: 'login_error',
        username: data?.username || null,
        error: error.message,
      }, `[gRPC] Error en Login para usuario=${data?.username || null}: ${error.message}`);

      throw new RpcException({
        code: error.code !== undefined ? error.code : 13,
        message: error.rawMessage || error.message,
      });
    }
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(data) {
    this.logger.log({
      context: 'GrpcAuthController',
      event: 'refresh_token_call',
    }, '[gRPC] RefreshToken llamado');

    try {
      const response = await this.authClient.refreshToken({
        refreshToken: data?.refreshToken || data?.refresh_token,
      });

      this.logger.log({
        context: 'GrpcAuthController',
        event: 'refresh_token_success',
      }, '[gRPC] RefreshToken exitoso');

      return {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        mfaRequired: response.mfaRequired,
        requiresAppUpdate: response.requiresAppUpdate,
        tokenType: response.tokenType,
        expiresIn: response.expiresIn,
        sessionId: response.sessionId,
        access_token: response.accessToken,
        refresh_token: response.refreshToken,
        mfa_required: response.mfaRequired,
        requires_app_update: response.requiresAppUpdate,
        token_type: response.tokenType,
        expires_in: response.expiresIn,
        session_id: response.sessionId,
      };
    } catch (error) {
      this.logger.error({
        context: 'GrpcAuthController',
        event: 'refresh_token_error',
        error: error.message,
      }, `[gRPC] Error en RefreshToken: ${error.message}`);

      throw new RpcException({
        code: error.code !== undefined ? error.code : 13,
        message: error.rawMessage || error.message,
      });
    }
  }

  @GrpcMethod('AuthService', 'Logout')
  async logout(data) {
    this.logger.log({
      context: 'GrpcAuthController',
      event: 'logout_call',
    }, '[gRPC] Logout llamado');

    try {
      const response = await this.authClient.logout({
        token: data?.token,
        refreshToken: data?.refreshToken || data?.refresh_token,
      });

      this.logger.log({
        context: 'GrpcAuthController',
        event: 'logout_success',
      }, '[gRPC] Logout exitoso');

      return {
        success: Boolean(response.success),
        message: response.message || '',
      };
    } catch (error) {
      this.logger.error({
        context: 'GrpcAuthController',
        event: 'logout_error',
        error: error.message,
      }, `[gRPC] Error en Logout: ${error.message}`);

      throw new RpcException({
        code: error.code !== undefined ? error.code : 13,
        message: error.rawMessage || error.message,
      });
    }
  }
}
