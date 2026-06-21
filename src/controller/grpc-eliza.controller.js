import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { ElizaGrpcClientService } from '../services/eliza-grpc-client.service';

/**
 * Controlador gRPC para el servicio ElizaService.
 * 
 * Recibe llamadas gRPC nativas en el puerto 50050
 * y las reenvía al microservicio academico-usuarios vía ConnectRPC.
 * 
 * El package y servicio en el .proto son:
 *   package: eliza.v1
 *   service: ElizaService
 */
@Controller()
export class GrpcElizaController {
  constructor(
    @Inject(ElizaGrpcClientService) elizaClient,
    @Inject(Logger) logger,
  ) {
    this.elizaClient = elizaClient;
    this.logger = logger;
  }

  /**
   * Método Say.
   * Corresponde a: rpc Say(SayRequest) returns (SayResponse)
   */
  @GrpcMethod('ElizaService', 'Say')
  async say(data) {
    this.logger.log({
      context: 'GrpcElizaController',
      event: 'say_call',
      sentence: data?.sentence || null,
    }, '[gRPC] Say llamado');

    try {
      const response = await this.elizaClient.say(data);
      return {
        sentence: response.sentence,
      };
    } catch (error) {
      this.logger.error({
        context: 'GrpcElizaController',
        event: 'say_error',
        error: error.message,
      }, `[gRPC] Error en Say: ${error.message}`);
      throw error;
    }
  }

  /**
   * Método Login.
   * Corresponde a: rpc Login(LoginRequest) returns (LoginResponse)
   */
  @GrpcMethod('ElizaService', 'Login')
  async login(data) {
    this.logger.log({
      context: 'GrpcElizaController',
      event: 'login_call',
      username: data?.username || null,
    }, `[gRPC] Login llamado para usuario=${data?.username || null}`);

    try {
      const response = await this.elizaClient.login({
        username: data?.username,
        password: data?.password,
        appVersion: data?.appVersion || data?.app_version,
      });
      
      this.logger.log({
        context: 'GrpcElizaController',
        event: 'login_success',
        username: data?.username || null,
      }, `[gRPC] Login exitoso para usuario=${data?.username || null}`);

      return {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        mfaRequired: response.mfaRequired,
        requiresAppUpdate: response.requiresAppUpdate,
        // Also support snake_case just in case
        access_token: response.accessToken,
        refresh_token: response.refreshToken,
        mfa_required: response.mfaRequired,
        requires_app_update: response.requiresAppUpdate,
      };
    } catch (error) {
      this.logger.error({
        context: 'GrpcElizaController',
        event: 'login_error',
        username: data?.username || null,
        error: error.message,
      }, `[gRPC] Error en Login para usuario=${data?.username || null}: ${error.message}`);
      throw error;
    }
  }
}
