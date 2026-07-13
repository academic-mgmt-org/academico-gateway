import * as grpc from '@grpc/grpc-js';
import {
  createUpstreamMetadata,
  loadGatewayPackageDefinition,
  normalizeGrpcTarget,
  resolveGrpcHealthRoute,
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

  it('no enruta catalogo porque el servicio fue retirado', () => {
    expect(resolveGrpcProxyRoute('catalogo.v1.CatalogoService')).toBeNull();
  });

  it('enruta cualquier servicio solicitudes.v1 al upstream de solicitudes', () => {
    const env = {
      SOLICITUDES_BASE_URL: 'http://academico-solicitudes:3006',
      SOLICITUDES_API_KEY: 'internal-solicitudes-key',
    };

    expect(resolveGrpcProxyRoute('solicitudes.v1.AcademicRequestService', env)).toMatchObject({
      routeName: 'solicitudes',
      target: 'academico-solicitudes:3006',
      apiKey: 'internal-solicitudes-key',
    });

    expect(resolveGrpcProxyRoute('solicitudes.v1.HealthService', env)).toMatchObject({
      routeName: 'solicitudes',
      target: 'academico-solicitudes:3006',
      apiKey: 'internal-solicitudes-key',
    });
  });

  it('enruta health custom de servicios academicos al upstream correspondiente', () => {
    const env = {
      USUARIOS_BASE_URL: 'http://academico-usuarios:3002',
      USUARIOS_API_KEY: 'usuarios-key',
      MATRICULAS_BASE_URL: 'http://academico-matriculas:3005',
      MATRICULAS_API_KEY: 'matriculas-key',
      CALIFICACIONES_BASE_URL: 'http://academico-calificaciones:3004',
      CALIFICACIONES_API_KEY: 'calificaciones-key',
      NOTIFICACIONES_BASE_URL: 'http://academico-notificaciones:3003',
      NOTIFICACIONES_API_KEY: 'notificaciones-key',
      SOLICITUDES_BASE_URL: 'http://academico-solicitudes:3006',
      SOLICITUDES_API_KEY: 'solicitudes-key',
    };

    expect(resolveGrpcProxyRoute('usuarios.v1.HealthService', env)).toMatchObject({
      routeName: 'usuarios',
      target: 'academico-usuarios:3002',
      apiKey: 'usuarios-key',
    });
    expect(resolveGrpcProxyRoute('matriculas.v1.HealthService', env)).toMatchObject({
      routeName: 'matriculas',
      target: 'academico-matriculas:3005',
      apiKey: 'matriculas-key',
    });
    expect(resolveGrpcProxyRoute('calificaciones.v1.HealthService', env)).toMatchObject({
      routeName: 'calificaciones',
      target: 'academico-calificaciones:3004',
      apiKey: 'calificaciones-key',
    });
    expect(resolveGrpcProxyRoute('solicitudes.v1.HealthService', env)).toMatchObject({
      routeName: 'solicitudes',
      target: 'academico-solicitudes:3006',
      apiKey: 'solicitudes-key',
    });
    expect(resolveGrpcProxyRoute('grpc.health.v1.Health', env)).toBeNull();
  });

  it('enruta health gRPC standard segun el nombre de servicio solicitado', () => {
    const env = {
      LOGIN_BASE_URL: 'http://academico-login:3001',
      LOGIN_API_KEY: 'login-key',
      USUARIOS_BASE_URL: 'http://academico-usuarios:3002',
      USUARIOS_API_KEY: 'usuarios-key',
      MATRICULAS_BASE_URL: 'http://academico-matriculas:3005',
      MATRICULAS_API_KEY: 'matriculas-key',
      CALIFICACIONES_BASE_URL: 'http://academico-calificaciones:3004',
      CALIFICACIONES_API_KEY: 'calificaciones-key',
      NOTIFICACIONES_BASE_URL: 'http://academico-notificaciones:3003',
      NOTIFICACIONES_API_KEY: 'notificaciones-key',
      SOLICITUDES_BASE_URL: 'http://academico-solicitudes:3006',
      SOLICITUDES_API_KEY: 'solicitudes-key',
    };

    expect(resolveGrpcHealthRoute('academico-usuarios-readiness', env)).toMatchObject({
      routeName: 'usuarios',
      target: 'academico-usuarios:3002',
      apiKey: 'usuarios-key',
    });
    expect(resolveGrpcHealthRoute('academico-matriculas-liveness', env)).toMatchObject({
      routeName: 'matriculas',
      target: 'academico-matriculas:3005',
      apiKey: 'matriculas-key',
    });
    expect(resolveGrpcHealthRoute('calificaciones.v1.HealthService', env)).toMatchObject({
      routeName: 'calificaciones',
      target: 'academico-calificaciones:3004',
      apiKey: 'calificaciones-key',
    });
    expect(resolveGrpcHealthRoute('auth.v1.HealthService', env)).toMatchObject({
      routeName: 'login',
      target: 'academico-login:3001',
      apiKey: 'login-key',
    });
    expect(resolveGrpcHealthRoute('academico-notificaciones-readiness', env)).toMatchObject({
      routeName: 'notificaciones',
      target: 'academico-notificaciones:3003',
      apiKey: 'notificaciones-key',
    });
    expect(resolveGrpcHealthRoute('academico-solicitudes-readiness', env)).toMatchObject({
      routeName: 'solicitudes',
      target: 'academico-solicitudes:3006',
      apiKey: 'solicitudes-key',
    });
    expect(resolveGrpcHealthRoute('academico-desconocido-readiness', env)).toBeNull();
  });

  it('reemplaza la API key de cliente por la API key interna y conserva authorization', () => {
    const clientMetadata = new grpc.Metadata();
    clientMetadata.set('authorization', 'Bearer access-token');
    clientMetadata.set('x-api-key', 'client-key');

    const upstreamMetadata = createUpstreamMetadata(clientMetadata, 'internal-key');

    expect(upstreamMetadata.get('authorization')).toEqual(['Bearer access-token']);
    expect(upstreamMetadata.get('x-api-key')).toEqual(['internal-key']);
  });

  it('publica los servicios gRPC de salud y negocio del gateway', () => {
    const packageDefinition = loadGatewayPackageDefinition();

    expect(packageDefinition['auth.v1.AuthService']).toBeDefined();
    expect(packageDefinition['auth.v1.HealthService']).toBeDefined();
    expect(packageDefinition['auth.v1.WhitelistService']).toBeDefined();
    expect(packageDefinition['usuarios.v1.UserManagementService']).toBeDefined();
    expect(packageDefinition['usuarios.v1.AcademicStructureService']).toBeDefined();
    expect(packageDefinition['usuarios.v1.HealthService']).toBeDefined();
    expect(packageDefinition['matriculas.v1.EnrollmentService']).toBeDefined();
    expect(packageDefinition['matriculas.v1.SubjectEnrollmentService']).toBeDefined();
    expect(packageDefinition['matriculas.v1.HealthService']).toBeDefined();
    expect(packageDefinition['calificaciones.v1.GradingService']).toBeDefined();
    expect(packageDefinition['calificaciones.v1.HealthService']).toBeDefined();
    expect(packageDefinition['solicitudes.v1.AcademicRequestService']).toBeDefined();
    expect(packageDefinition['solicitudes.v1.HealthService']).toBeDefined();
    expect(packageDefinition['notificaciones.v1.NotificationService']).toBeDefined();
    expect(packageDefinition['notificaciones.v1.EmailService']).toBeDefined();
    expect(packageDefinition['notificaciones.v1.HealthService']).toBeDefined();
    expect(packageDefinition['grpc.health.v1.Health']).toBeDefined();
  });

  it('preserva los nombres snake_case del contrato protobuf publicado', () => {
    const packageDefinition = loadGatewayPackageDefinition();
    const enrollmentService = packageDefinition['matriculas.v1.EnrollmentService'];

    expect(
      enrollmentService.CreateEnrollment.requestType.type.field.map(({ name }) => name),
    ).toEqual([
      'estudiante_id',
      'oferta_curso_id',
      'estudiante_cedula',
      'estado',
      'observacion',
    ]);
    expect(
      enrollmentService.ListEnrollments.requestType.type.field.map(({ name }) => name),
    ).toEqual([
      'estudiante_id',
      'estudiante_cedula',
      'oferta_curso_id',
      'ciclo_acad_codigo',
      'materia_codigo',
      'paralelo_codigo',
      'estado',
      'limit',
      'offset',
    ]);
  });
});
