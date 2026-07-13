import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ReflectionService } from '@grpc/reflection';
import { join } from 'path';

const PROTO_ROOT = join(__dirname, '..', 'proto');

const PROTO_PATHS = [
  join(PROTO_ROOT, 'auth.proto'),
  join(PROTO_ROOT, 'usuarios/v1/usuarios.proto'),
  join(PROTO_ROOT, 'matriculas/v1/matriculas.proto'),
  join(PROTO_ROOT, 'calificaciones/v1/calificaciones.proto'),
  join(PROTO_ROOT, 'solicitudes/v1/solicitudes.proto'),
  join(PROTO_ROOT, 'notificaciones/v1/notificaciones.proto'),
  join(PROTO_ROOT, 'grpc/health/v1/health.proto'),
];

const PROTO_LOADER_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_ROOT],
};

const STANDARD_HEALTH_SERVICE_NAME = 'grpc.health.v1.Health';
const STANDARD_HEALTH_SERVING_STATUS = {
  UNKNOWN: 'UNKNOWN',
  SERVING: 'SERVING',
  NOT_SERVING: 'NOT_SERVING',
  SERVICE_UNKNOWN: 'SERVICE_UNKNOWN',
};

const ROUTE_PREFIXES = [
  {
    prefix: 'auth.v1.',
    routeName: 'login',
    baseUrlEnv: 'LOGIN_BASE_URL',
    apiKeyEnv: 'LOGIN_API_KEY',
  },
  {
    prefix: 'notificaciones.v1.',
    routeName: 'notificaciones',
    baseUrlEnv: 'NOTIFICACIONES_BASE_URL',
    apiKeyEnv: 'NOTIFICACIONES_API_KEY',
  },
  {
    prefix: 'usuarios.v1.',
    routeName: 'usuarios',
    baseUrlEnv: 'USUARIOS_BASE_URL',
    apiKeyEnv: 'USUARIOS_API_KEY',
  },
  {
    prefix: 'matriculas.v1.',
    routeName: 'matriculas',
    baseUrlEnv: 'MATRICULAS_BASE_URL',
    apiKeyEnv: 'MATRICULAS_API_KEY',
  },
  {
    prefix: 'calificaciones.v1.',
    routeName: 'calificaciones',
    baseUrlEnv: 'CALIFICACIONES_BASE_URL',
    apiKeyEnv: 'CALIFICACIONES_API_KEY',
  },
  {
    prefix: 'solicitudes.v1.',
    routeName: 'solicitudes',
    baseUrlEnv: 'SOLICITUDES_BASE_URL',
    apiKeyEnv: 'SOLICITUDES_API_KEY',
  },
];

const STANDARD_HEALTH_ROUTES = [
  {
    routeName: 'login',
    baseUrlEnv: 'LOGIN_BASE_URL',
    apiKeyEnv: 'LOGIN_API_KEY',
    customHealthServiceName: 'auth.v1.HealthService',
    aliases: [
      'login',
      'auth',
      'autenticacion',
      'academico-login',
      'academico-auth',
      'auth.v1.AuthService',
      'auth.v1.HealthService',
    ],
  },
  {
    routeName: 'notificaciones',
    baseUrlEnv: 'NOTIFICACIONES_BASE_URL',
    apiKeyEnv: 'NOTIFICACIONES_API_KEY',
    customHealthServiceName: 'notificaciones.v1.HealthService',
    aliases: [
      'notificaciones',
      'notificacion',
      'notifications',
      'academico-notificaciones',
      'notificaciones.v1.NotificationService',
      'notificaciones.v1.EmailService',
      'notificaciones.v1.HealthService',
    ],
  },
  {
    routeName: 'usuarios',
    baseUrlEnv: 'USUARIOS_BASE_URL',
    apiKeyEnv: 'USUARIOS_API_KEY',
    customHealthServiceName: 'usuarios.v1.HealthService',
    aliases: [
      'usuarios',
      'usuario',
      'users',
      'academico-usuarios',
      'usuarios.v1.HealthService',
    ],
  },
  {
    routeName: 'matriculas',
    baseUrlEnv: 'MATRICULAS_BASE_URL',
    apiKeyEnv: 'MATRICULAS_API_KEY',
    customHealthServiceName: 'matriculas.v1.HealthService',
    aliases: [
      'matriculas',
      'matricula',
      'enrollments',
      'academico-matriculas',
      'matriculas.v1.HealthService',
    ],
  },
  {
    routeName: 'calificaciones',
    baseUrlEnv: 'CALIFICACIONES_BASE_URL',
    apiKeyEnv: 'CALIFICACIONES_API_KEY',
    customHealthServiceName: 'calificaciones.v1.HealthService',
    aliases: [
      'calificaciones',
      'calificacion',
      'grades',
      'academico-calificaciones',
      'calificaciones.v1.HealthService',
    ],
  },
  {
    routeName: 'solicitudes',
    baseUrlEnv: 'SOLICITUDES_BASE_URL',
    apiKeyEnv: 'SOLICITUDES_API_KEY',
    customHealthServiceName: 'solicitudes.v1.HealthService',
    aliases: [
      'solicitudes',
      'solicitud',
      'requests',
      'academico-solicitudes',
      'solicitudes.v1.AcademicRequestService',
      'solicitudes.v1.HealthService',
    ],
  },
];

const CLIENT_METADATA_BLOCKLIST = new Set([
  'x-api-key',
  'api-key',
  'x-gateway-key',
  'host',
  'connection',
  'content-length',
  'content-type',
  'te',
  'user-agent',
]);

function log(logger, level, payload, message) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](payload, message);
    return;
  }

  const output = message || payload;
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export function normalizeGrpcTarget(baseUrl) {
  if (!baseUrl) {
    return '';
  }

  try {
    const parsed = new URL(baseUrl);
    if (parsed.host) {
      return parsed.host;
    }
  } catch {
    return baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  return baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function buildRoute(routeConfig, env = process.env) {
  const baseUrl = env[routeConfig.baseUrlEnv] || '';

  return {
    ...routeConfig,
    baseUrl,
    target: normalizeGrpcTarget(baseUrl),
    apiKey: env[routeConfig.apiKeyEnv] || '',
  };
}

export function resolveGrpcProxyRoute(serviceName, env = process.env) {
  const route = ROUTE_PREFIXES.find((candidate) => serviceName.startsWith(candidate.prefix));

  if (!route) {
    return null;
  }

  return buildRoute(route, env);
}

function normalizeHealthServiceName(serviceName) {
  return String(serviceName || '').trim().toLowerCase();
}

function tokenizeHealthServiceName(serviceName) {
  return normalizeHealthServiceName(serviceName)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function healthAliasMatches(serviceName, alias) {
  const normalizedServiceName = normalizeHealthServiceName(serviceName);
  const normalizedAlias = normalizeHealthServiceName(alias);

  if (!normalizedServiceName || !normalizedAlias) {
    return false;
  }

  if (normalizedServiceName === normalizedAlias) {
    return true;
  }

  const aliasTokens = tokenizeHealthServiceName(normalizedAlias);
  const serviceTokens = tokenizeHealthServiceName(normalizedServiceName);

  if (aliasTokens.length === 1) {
    return serviceTokens.includes(aliasTokens[0]);
  }

  return normalizedServiceName.includes(normalizedAlias);
}

export function resolveGrpcHealthRoute(serviceName, env = process.env) {
  const route = STANDARD_HEALTH_ROUTES.find((candidate) => (
    candidate.aliases.some((alias) => healthAliasMatches(serviceName, alias))
  ));

  if (!route) {
    return null;
  }

  return buildRoute(route, env);
}

export function createUpstreamMetadata(clientMetadata, apiKey) {
  const upstreamMetadata = new grpc.Metadata();
  const metadataMap = clientMetadata?.getMap ? clientMetadata.getMap() : {};

  for (const key of Object.keys(metadataMap)) {
    const normalizedKey = key.toLowerCase();

    if (
      CLIENT_METADATA_BLOCKLIST.has(normalizedKey) ||
      normalizedKey.startsWith(':') ||
      normalizedKey.startsWith('grpc-')
    ) {
      continue;
    }

    const values = clientMetadata.get(key);
    for (const value of values) {
      upstreamMetadata.add(normalizedKey, value);
    }
  }

  if (apiKey) {
    upstreamMetadata.set('x-api-key', apiKey);
  }

  return upstreamMetadata;
}

function isServiceDefinition(definition) {
  return Boolean(
    definition &&
    typeof definition === 'object' &&
    Object.values(definition).some((methodDefinition) => (
      methodDefinition &&
      typeof methodDefinition === 'object' &&
      typeof methodDefinition.path === 'string' &&
      typeof methodDefinition.requestDeserialize === 'function'
    )),
  );
}

function getProxyCallError(route) {
  if (!route) {
    return {
      code: grpc.status.UNIMPLEMENTED,
      details: 'No hay ruta proxy configurada para este servicio gRPC.',
    };
  }

  if (!route.target) {
    return {
      code: grpc.status.UNAVAILABLE,
      details: `${route.baseUrlEnv} no esta configurado para enrutar ${route.routeName}.`,
    };
  }

  return null;
}

function attachCancellation(downstreamCall, upstreamCall) {
  if (
    downstreamCall &&
    typeof downstreamCall.on === 'function' &&
    upstreamCall &&
    typeof upstreamCall.cancel === 'function'
  ) {
    downstreamCall.on('cancelled', () => upstreamCall.cancel());
  }
}

function forwardReadableToServerCall(upstreamCall, downstreamCall) {
  upstreamCall.on('metadata', (metadata) => {
    if (typeof downstreamCall.sendMetadata === 'function') {
      downstreamCall.sendMetadata(metadata);
    }
  });
  upstreamCall.on('data', (message) => downstreamCall.write(message));
  upstreamCall.on('end', () => downstreamCall.end());
  upstreamCall.on('error', (error) => downstreamCall.emit('error', error));
}

function createProxyClient(serviceName, serviceDefinition, route, logger) {
  if (!route?.target) {
    return null;
  }

  const Client = grpc.makeGenericClientConstructor(serviceDefinition, serviceName);
  const client = new Client(
    route.target,
    grpc.credentials.createInsecure(),
    {
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 10000,
    },
  );

  log(logger, 'log', {
    context: 'GrpcProxyServer',
    event: 'proxy_client_created',
    serviceName,
    routeName: route.routeName,
    target: route.target,
  }, `[gRPC proxy] ${serviceName} -> ${route.target}`);

  return client;
}

function createClientEntry(serviceName, serviceDefinition, route, logger) {
  return {
    route,
    client: createProxyClient(serviceName, serviceDefinition, route, logger),
  };
}

function createUnaryProxyHandler({ client, methodName, route, logger }) {
  return (call, callback) => {
    const setupError = getProxyCallError(route);
    if (setupError) {
      callback(setupError, null);
      return;
    }

    const upstreamMetadata = createUpstreamMetadata(call.metadata, route.apiKey);
    const upstreamCall = client[methodName](call.request, upstreamMetadata, (error, response) => {
      if (error) {
        log(logger, 'warn', {
          context: 'GrpcProxyServer',
          event: 'proxy_call_error',
          methodName,
          routeName: route.routeName,
          code: error.code,
          details: error.details || error.message,
        }, `[gRPC proxy] Error en ${methodName}: ${error.details || error.message}`);
      }

      callback(error, response);
    });

    attachCancellation(call, upstreamCall);
  };
}

function createClientStreamProxyHandler({ client, methodName, route }) {
  return (call, callback) => {
    const setupError = getProxyCallError(route);
    if (setupError) {
      callback(setupError, null);
      return;
    }

    const upstreamMetadata = createUpstreamMetadata(call.metadata, route.apiKey);
    const upstreamCall = client[methodName](upstreamMetadata, callback);

    attachCancellation(call, upstreamCall);
    call.pipe(upstreamCall);
  };
}

function createServerStreamProxyHandler({ client, methodName, route }) {
  return (call) => {
    const setupError = getProxyCallError(route);
    if (setupError) {
      call.emit('error', setupError);
      return;
    }

    const upstreamMetadata = createUpstreamMetadata(call.metadata, route.apiKey);
    const upstreamCall = client[methodName](call.request, upstreamMetadata);

    attachCancellation(call, upstreamCall);
    forwardReadableToServerCall(upstreamCall, call);
  };
}

function createBidiProxyHandler({ client, methodName, route }) {
  return (call) => {
    const setupError = getProxyCallError(route);
    if (setupError) {
      call.emit('error', setupError);
      return;
    }

    const upstreamMetadata = createUpstreamMetadata(call.metadata, route.apiKey);
    const upstreamCall = client[methodName](upstreamMetadata);

    attachCancellation(call, upstreamCall);
    forwardReadableToServerCall(upstreamCall, call);
    call.pipe(upstreamCall);
  };
}

function createProxyHandler({ client, methodName, methodDefinition, route, logger }) {
  const handlerContext = {
    client,
    methodName,
    methodDefinition,
    route,
    logger,
  };

  if (methodDefinition.requestStream && methodDefinition.responseStream) {
    return createBidiProxyHandler(handlerContext);
  }

  if (methodDefinition.requestStream) {
    return createClientStreamProxyHandler(handlerContext);
  }

  if (methodDefinition.responseStream) {
    return createServerStreamProxyHandler(handlerContext);
  }

  return createUnaryProxyHandler(handlerContext);
}

function createProxyImplementation({ serviceName, serviceDefinition, route, logger }) {
  const client = createProxyClient(serviceName, serviceDefinition, route, logger);
  const implementation = {};

  for (const [methodName, methodDefinition] of Object.entries(serviceDefinition)) {
    implementation[methodName] = createProxyHandler({
      client,
      methodName,
      methodDefinition,
      route,
      logger,
    });
  }

  return implementation;
}

function getCustomHealthMethodName(serviceName) {
  const tokens = tokenizeHealthServiceName(serviceName);

  if (tokens.includes('readiness') || tokens.includes('ready')) {
    return 'Ready';
  }

  if (tokens.includes('liveness') || tokens.includes('live')) {
    return 'Live';
  }

  return 'Health';
}

function mapCustomHealthResponseToStatus(methodName, response) {
  if (methodName === 'Ready') {
    return response?.ready
      ? STANDARD_HEALTH_SERVING_STATUS.SERVING
      : STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING;
  }

  if (methodName === 'Live') {
    return response?.alive
      ? STANDARD_HEALTH_SERVING_STATUS.SERVING
      : STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING;
  }

  const status = String(response?.status || '').trim().toLowerCase();
  if (['serving', 'healthy', 'ok', 'up'].includes(status)) {
    return STANDARD_HEALTH_SERVING_STATUS.SERVING;
  }

  return STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING;
}

function shouldFallbackToCustomHealth(error, response) {
  return (
    Boolean(error) ||
    response?.status === STANDARD_HEALTH_SERVING_STATUS.SERVICE_UNKNOWN
  );
}

function createHealthClientMap({ packageDefinition, serviceName, routes, logger }) {
  const serviceDefinition = packageDefinition[serviceName];
  const clients = new Map();

  if (!isServiceDefinition(serviceDefinition)) {
    return clients;
  }

  for (const routeConfig of routes) {
    const route = buildRoute(routeConfig);

    if (!route.target) {
      continue;
    }

    clients.set(route.routeName, createClientEntry(serviceName, serviceDefinition, route, logger));
  }

  return clients;
}

function createCustomHealthClientMap({ packageDefinition, logger }) {
  const clients = new Map();

  for (const routeConfig of STANDARD_HEALTH_ROUTES) {
    if (!routeConfig.customHealthServiceName) {
      continue;
    }

    const serviceDefinition = packageDefinition[routeConfig.customHealthServiceName];
    const route = buildRoute(routeConfig);

    if (!route.target || !isServiceDefinition(serviceDefinition)) {
      continue;
    }

    clients.set(
      route.routeName,
      createClientEntry(routeConfig.customHealthServiceName, serviceDefinition, route, logger),
    );
  }

  return clients;
}

function respondWithCustomHealth({
  call,
  callback,
  logger,
  route,
  requestedService,
  customHealthClients,
  fallbackStatus = STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING,
}) {
  const entry = customHealthClients.get(route.routeName);
  const methodName = getCustomHealthMethodName(requestedService);

  if (!entry?.client || typeof entry.client[methodName] !== 'function') {
    callback(null, { status: fallbackStatus });
    return;
  }

  const upstreamMetadata = createUpstreamMetadata(call.metadata, route.apiKey);
  const upstreamCall = entry.client[methodName]({}, upstreamMetadata, (error, response) => {
    if (error) {
      log(logger, 'warn', {
        context: 'GrpcProxyServer',
        event: 'standard_health_custom_fallback_error',
        service: requestedService,
        routeName: route.routeName,
        methodName,
        code: error.code,
        details: error.details || error.message,
      }, `[gRPC proxy] Error en fallback health ${route.routeName}.${methodName}: ${error.details || error.message}`);

      callback(null, { status: STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING });
      return;
    }

    callback(null, { status: mapCustomHealthResponseToStatus(methodName, response) });
  });

  attachCancellation(call, upstreamCall);
}

function createStandardHealthImplementation({ packageDefinition, logger }) {
  const standardHealthClients = createHealthClientMap({
    packageDefinition,
    serviceName: STANDARD_HEALTH_SERVICE_NAME,
    routes: STANDARD_HEALTH_ROUTES,
    logger,
  });
  const customHealthClients = createCustomHealthClientMap({ packageDefinition, logger });

  return {
    Check(call, callback) {
      const requestedService = call.request?.service || '';

      if (!requestedService) {
        callback(null, { status: STANDARD_HEALTH_SERVING_STATUS.SERVING });
        return;
      }

      const route = resolveGrpcHealthRoute(requestedService);

      if (!route) {
        callback(null, { status: STANDARD_HEALTH_SERVING_STATUS.SERVICE_UNKNOWN });
        return;
      }

      if (!route.target) {
        log(logger, 'warn', {
          context: 'GrpcProxyServer',
          event: 'standard_health_route_unconfigured',
          service: requestedService,
          routeName: route.routeName,
          baseUrlEnv: route.baseUrlEnv,
        }, `[gRPC proxy] ${route.baseUrlEnv} no esta configurado para health ${requestedService}.`);

        callback(null, { status: STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING });
        return;
      }

      const entry = standardHealthClients.get(route.routeName);

      if (!entry?.client || typeof entry.client.Check !== 'function') {
        respondWithCustomHealth({
          call,
          callback,
          logger,
          route,
          requestedService,
          customHealthClients,
        });
        return;
      }

      const upstreamMetadata = createUpstreamMetadata(call.metadata, route.apiKey);
      const upstreamCall = entry.client.Check(call.request, upstreamMetadata, (error, response) => {
        if (!error && !shouldFallbackToCustomHealth(error, response)) {
          callback(null, response);
          return;
        }

        if (shouldFallbackToCustomHealth(error, response)) {
          respondWithCustomHealth({
            call,
            callback,
            logger,
            route,
            requestedService,
            customHealthClients,
            fallbackStatus: response?.status || STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING,
          });
          return;
        }

        log(logger, 'warn', {
          context: 'GrpcProxyServer',
          event: 'standard_health_proxy_error',
          service: requestedService,
          routeName: route.routeName,
          code: error.code,
          details: error.details || error.message,
        }, `[gRPC proxy] Error en health ${requestedService}: ${error.details || error.message}`);

        callback(null, { status: STANDARD_HEALTH_SERVING_STATUS.NOT_SERVING });
      });

      attachCancellation(call, upstreamCall);
    },
  };
}

export function loadGatewayPackageDefinition() {
  return protoLoader.loadSync(PROTO_PATHS, PROTO_LOADER_OPTIONS);
}

export function registerStandardHealthService(server, packageDefinition, logger = console) {
  const serviceDefinition = packageDefinition[STANDARD_HEALTH_SERVICE_NAME];

  if (!isServiceDefinition(serviceDefinition)) {
    log(logger, 'warn', {
      context: 'GrpcProxyServer',
      event: 'standard_health_definition_missing',
      serviceName: STANDARD_HEALTH_SERVICE_NAME,
    }, `[gRPC proxy] No se registro ${STANDARD_HEALTH_SERVICE_NAME}: definicion no encontrada.`);
    return null;
  }

  server.addService(
    serviceDefinition,
    createStandardHealthImplementation({ packageDefinition, logger }),
  );

  return {
    serviceName: STANDARD_HEALTH_SERVICE_NAME,
    routeName: 'standard-health-dispatcher',
    target: 'dynamic',
    methods: Object.keys(serviceDefinition),
  };
}

export function registerProxyServices(server, packageDefinition, logger = console) {
  const registeredServices = [];

  for (const [serviceName, serviceDefinition] of Object.entries(packageDefinition)) {
    if (serviceName === STANDARD_HEALTH_SERVICE_NAME) {
      continue;
    }

    if (!isServiceDefinition(serviceDefinition)) {
      continue;
    }

    const route = resolveGrpcProxyRoute(serviceName);
    if (!route) {
      log(logger, 'warn', {
        context: 'GrpcProxyServer',
        event: 'proxy_route_missing',
        serviceName,
      }, `[gRPC proxy] No se registro ${serviceName}: no hay ruta configurada.`);
      continue;
    }

    server.addService(
      serviceDefinition,
      createProxyImplementation({
        serviceName,
        serviceDefinition,
        route,
        logger,
      }),
    );

    registeredServices.push({
      serviceName,
      routeName: route.routeName,
      target: route.target,
      methods: Object.keys(serviceDefinition),
    });
  }

  return registeredServices;
}

export async function startGrpcProxyServer({
  host = '0.0.0.0',
  port = process.env.GRPC_PORT || '50050',
  logger = console,
} = {}) {
  const packageDefinition = loadGatewayPackageDefinition();
  const server = new grpc.Server();

  const registeredServices = registerProxyServices(server, packageDefinition, logger);
  const standardHealthService = registerStandardHealthService(server, packageDefinition, logger);
  if (standardHealthService) {
    registeredServices.push(standardHealthService);
  }

  new ReflectionService(packageDefinition).addToServer(server);

  const bindAddress = `${host}:${port}`;

  await new Promise((resolve, reject) => {
    server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (error, actualPort) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(actualPort);
    });
  });

  log(logger, 'log', {
    context: 'GrpcProxyServer',
    event: 'grpc_proxy_started',
    bindAddress,
    registeredServices,
  }, `[gRPC proxy] escuchando en ${bindAddress}`);

  return {
    server,
    bindAddress,
    registeredServices,
  };
}
