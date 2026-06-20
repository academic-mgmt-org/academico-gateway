import { Test } from '@nestjs/testing';
import { ProxyService } from '../services/proxy.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as httpProxy from 'http-proxy-middleware';
import { services } from '../config/services.config';
import { Logger } from 'nestjs-pino';
jest.mock('http-proxy-middleware');
describe('ProxyService', () => {
  let proxyService;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ProxyService, {
        provide: Logger,
        useValue: {
          debug: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        }
      }]
    }).compile();
    proxyService = module.get(ProxyService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('✅ debe invocar el proxy correctamente para un microservicio registrado (CA1, CA3)', async () => {
    const req = {
      path: '/usuarios/login',
      method: 'POST',
      headers: {}
    };
    const res = {};
    const fakeProxy = jest.fn();
    httpProxy.createProxyMiddleware.mockReturnValue(fakeProxy);

    // Simular un servicio registrado
    services.usuarios = {
      baseUrl: 'http://usuarios.test',
      apiKey: 'clave-usuarios'
    };

    // Inicializar proxies para llenar el cache
    proxyService.onModuleInit();
    await proxyService.processRequest(req, res);
    expect(httpProxy.createProxyMiddleware).toHaveBeenCalledWith(expect.objectContaining({
      target: 'http://usuarios.test',
      headers: {
        'x-api-key': 'clave-usuarios'
      }
    }));
    expect(fakeProxy).toHaveBeenCalledWith(req, res);
  });
  it('❌ debe lanzar HttpException si la URL no tiene segmentos válidos', async () => {
    const req = {
      path: '/'
    };
    const res = {};
    await expect(proxyService.processRequest(req, res)).rejects.toThrow(HttpException);
  });
  it('❌ debe lanzar HttpException si el microservicio no está registrado (CA1)', async () => {
    const req = {
      path: '/inexistente/endpoint'
    };
    const res = {};

    // Asegúrate que "inexistente" no está en services
    delete services.inexistente;
    await expect(proxyService.processRequest(req, res)).rejects.toThrowError(new HttpException({
      error: 'No se encontró el servicio',
      detalles: expect.any(String)
    }, HttpStatus.NOT_FOUND));
  });
});