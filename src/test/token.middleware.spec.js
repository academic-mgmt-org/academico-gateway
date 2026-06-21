import { Test } from '@nestjs/testing';
import { TokenMiddleware } from '../middleware/token.middleware';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../utils/redis.service';
import axios from 'axios';
import { UnauthorizedException } from '@nestjs/common';
import { services } from '../config/services.config';
import { Logger } from 'nestjs-pino';
jest.mock('axios');
const mockedAxios = axios;
describe('TokenMiddleware', () => {
  let middleware;
  let configService;
  let redisService;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TokenMiddleware, {
        provide: ConfigService,
        useValue: {
          get: jest.fn(key => {
            const config = {
              SEGURIDAD_BASE_URL: 'http://seguridad.test',
              SEGURIDAD_API_KEY: 'test-api-key'
            };
            return config[key];
          })
        }
      }, {
        provide: RedisService,
        useValue: {
          get: jest.fn(),
          set: jest.fn()
        }
      }, {
        provide: Logger,
        useValue: {
          debug: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        }
      }]
    }).compile();
    middleware = module.get(TokenMiddleware);
    configService = module.get(ConfigService);
    redisService = module.get(RedisService);

    // Configurar mock de usuarios por defecto para pruebas
    services.usuarios = {
      baseUrl: 'http://usuarios.test',
      apiKey: 'test-api-key'
    };
  });
  it('✅ permite acceso si está en white list (CA5)', async () => {
    const req = {
      originalUrl: '/auth/login',
      baseUrl: '/auth/login',
      headers: {}
    };
    const res = {};
    const next = jest.fn();
    jest.spyOn(redisService, 'get').mockImplementation(async key => {
      if (key.toUpperCase().includes('WHITELIST')) {
        return ['/auth/login'];
      }
      return null;
    });
    await middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });
  it('❌ lanza UnauthorizedException si no hay token (CA4)', async () => {
    const req = {
      originalUrl: '/calificaciones/v1/perfil',
      baseUrl: '/calificaciones/v1/perfil',
      headers: {}
    };
    const res = {};
    const next = jest.fn();
    jest.spyOn(redisService, 'get').mockImplementation(async key => {
      if (key.toUpperCase().includes('WHITELIST')) {
        return [];
      }
      return null;
    });
    await expect(middleware.use(req, res, next)).rejects.toThrow(UnauthorizedException);
  });
  it('✅ permite acceso si el token es válido (CA2, CA3)', async () => {
    const req = {
      originalUrl: '/calificaciones/v1/perfil',
      baseUrl: '/calificaciones/v1/perfil',
      headers: {
        authorization: 'Bearer test-token'
      }
    };
    const res = {};
    const next = jest.fn();
    jest.spyOn(redisService, 'get').mockImplementation(async key => {
      if (key.toUpperCase().includes('WHITELIST')) {
        return [];
      }
      return null;
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        isValid: true
      }
    });
    await middleware.use(req, res, next);
    expect(mockedAxios.post).toHaveBeenCalledWith('http://usuarios.test/api/v1/auth/validate-token-2', {}, expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer test-token',
        'x-api-key': 'test-api-key'
      })
    }));
    expect(next).toHaveBeenCalled();
  });
  it('❌ lanza UnauthorizedException si el token es inválido', async () => {
    const req = {
      originalUrl: '/calificaciones/v1/perfil',
      baseUrl: '/calificaciones/v1/perfil',
      headers: {
        authorization: 'Bearer test-token'
      }
    };
    const res = {};
    const next = jest.fn();
    jest.spyOn(redisService, 'get').mockImplementation(async key => {
      if (key.toUpperCase().includes('WHITELIST')) {
        return [];
      }
      return null;
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        isValid: false
      }
    });
    await expect(middleware.use(req, res, next)).rejects.toThrow(UnauthorizedException);
  });
});