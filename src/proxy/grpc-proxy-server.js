import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ReflectionService } from '@grpc/reflection';
import { join } from 'path';

const PROTO_ROOT = join(__dirname, '..', 'proto');

const PROTO_PATHS = [
  join(PROTO_ROOT, 'auth.proto'),
  join(PROTO_ROOT, 'catalogo/v1/catalogo.proto'),
  join(PROTO_ROOT, 'notificaciones/v1/notificaciones.proto'),
];

const PROTO_LOADER_OPTIONS = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_ROOT],
};

const ROUTE_PREFIXES = [
  {
    prefix: 'auth.v1.',
    routeName: 'login',
    baseUrlEnv: 'LOGIN_BASE_URL',
    apiKeyEnv: 'LOGIN_API_KEY',
  },
  {
    prefix: 'catalogo.v1.',
    routeName: 'catalogo',
    baseUrlEnv: 'CATALOGO_BASE_URL',
    apiKeyEnv: 'CATALOGO_API_KEY',
  },
  {
    prefix: 'notificaciones.v1.',
    routeName: 'notificaciones',
    baseUrlEnv: 'NOTIFICACIONES_BASE_URL',
    apiKeyEnv: 'NOTIFICACIONES_API_KEY',
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

export function resolveGrpcProxyRoute(serviceName, env = process.env) {
  const route = ROUTE_PREFIXES.find((candidate) => serviceName.startsWith(candidate.prefix));

  if (!route) {
    return null;
  }

  const baseUrl = env[route.baseUrlEnv] || '';

  return {
    ...route,
    baseUrl,
    target: normalizeGrpcTarget(baseUrl),
    apiKey: env[route.apiKeyEnv] || '',
  };
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

export function loadGatewayPackageDefinition() {
  return protoLoader.loadSync(PROTO_PATHS, PROTO_LOADER_OPTIONS);
}

export function registerProxyServices(server, packageDefinition, logger = console) {
  const registeredServices = [];

  for (const [serviceName, serviceDefinition] of Object.entries(packageDefinition)) {
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
