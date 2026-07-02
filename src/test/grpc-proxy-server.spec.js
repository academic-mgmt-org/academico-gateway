import * as grpc from '@grpc/grpc-js';
import {
  createUpstreamMetadata,
  loadGatewayPackageDefinition,
  normalizeGrpcTarget,
  resolveGrpcProxyRoute,
} from '../proxy/grpc-proxy-server';

describe('GrpcProxyServer', () => {
  it('normaliza URLs de servicios a targets gRPC', () => {
    expect(normalizeGrpcTarget('http://academico-notificaciones:3003')).toBe('academico-notificaciones:3003');
    expect(normalizeGrpcTarget('https://example.com:50050/')).toBe('example.com:50050');
    expect(normalizeGrpcTarget('localhost:3001')).toBe('localhost:3001');
  });

  it('enruta cualquier servicio notificaciones.v1 al upstream de notificaciones', () => {
    const env = {
      NOTIFICACIONES_BASE_URL: 'http://academico-notificaciones:3003',
      NOTIFICACIONES_API_KEY: 'internal-notificaciones-key',
    };

    expect(resolveGrpcProxyRoute('notificaciones.v1.NotificationService', env)).toMatchObject({
      routeName: 'notificaciones',
      target: 'academico-notificaciones:3003',
      apiKey: 'internal-notificaciones-key',
    });

    expect(resolveGrpcProxyRoute('notificaciones.v1.EmailService', env)).toMatchObject({
      routeName: 'notificaciones',
      target: 'academico-notificaciones:3003',
      apiKey: 'internal-notificaciones-key',
    });
  });

  it('reemplaza la API key de cliente por la API key interna y conserva authorization', () => {
    const clientMetadata = new grpc.Metadata();
    clientMetadata.set('authorization', 'Bearer access-token');
    clientMetadata.set('x-api-key', 'client-key');

    const upstreamMetadata = createUpstreamMetadata(clientMetadata, 'internal-key');

    expect(upstreamMetadata.get('authorization')).toEqual(['Bearer access-token']);
    expect(upstreamMetadata.get('x-api-key')).toEqual(['internal-key']);
  });

  it('publica NotificationService, EmailService y HealthService en reflexion local', () => {
    const packageDefinition = loadGatewayPackageDefinition();

    expect(packageDefinition['notificaciones.v1.NotificationService']).toBeDefined();
    expect(packageDefinition['notificaciones.v1.EmailService']).toBeDefined();
    expect(packageDefinition['notificaciones.v1.HealthService']).toBeDefined();
  });
});
