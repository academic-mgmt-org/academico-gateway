import { AuthGrpcClientService } from '../services/auth-grpc-client.service';

describe('AuthGrpcClientService', () => {
  function createService() {
    return new AuthGrpcClientService({
      debug: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });
  }

  it('envia ResetPassword al cliente gRPC interno con campos camelCase', async () => {
    const service = createService();
    service.client = {
      resetPassword: jest.fn().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
    };

    await service.resetPassword({
      token: 'reset-token',
      email: 'allunav@utn.edu.ec',
      new_password: 'NuevaPasswordSegura123!',
      password_encoding: 'plain',
    });

    expect(service.client.resetPassword).toHaveBeenCalledWith({
      token: 'reset-token',
      email: 'allunav@utn.edu.ec',
      newPassword: 'NuevaPasswordSegura123!',
      passwordEncoding: 'plain',
    });
  });
});
