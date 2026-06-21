import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { services } from '../config/services.config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { httpAgent, httpsAgent } from '../config/http-client.config';
import { Logger } from 'nestjs-pino';
@Injectable()
export class ProxyService {
  // 🔧 Cache de proxies reutilizables para prevenir memory leaks (solo HTTP)
  // NOTA: Socket.IO NO se cachea - debe crearse nuevo en cada conexión
  proxyCache = new Map();
  constructor(@Inject(Logger) logger) {
    this.logger = logger;
  } // Los proxies se inicializan en onModuleInit() para asegurar que 
  // la configuración desde .env ya esté cargada en el objeto 'services'

  /**
   * Inicialización asíncrona de proxies después de que el módulo esté listo
   */
  onModuleInit() {
    this.initializeProxies();
  }

  /**
   * Obtiene la configuración de timeout personalizada para cada microservicio
   * 
   * Algunos microservicios necesitan más tiempo de espera:
   * - Estudiante/Docente: Consultas pesadas a Oracle (30s)
   * - Seguridad: Operaciones rápidas (10s)
   * - Eventos: Operaciones normales (10s)
   * 
   * @param serviceName Nombre del microservicio
   * @returns Configuración de timeouts
   */
  getTimeoutForService(serviceName) {
    // Configuración personalizada por microservicio
    const customTimeouts = {
      'usuarios': {
        proxyTimeout: 10000,
        timeout: 10000
      },
      // 10s
      'catalogo': {
        proxyTimeout: 10000,
        timeout: 10000
      },
      // 10s
      'solicitudes': {
        proxyTimeout: 15000,
        timeout: 15000
      },
      // 15s
      'calificaciones': {
        proxyTimeout: 30000,
        timeout: 30000
      },
      // 30s
      'matriculas': {
        proxyTimeout: 30000,
        timeout: 30000
      } // 30s
    };

    // Retornar configuración personalizada o default (10s)
    const config = customTimeouts[serviceName] || {
      proxyTimeout: 10000,
      timeout: 10000
    };
    this.logger.debug({
      context: 'ProxyService',
      event: 'timeout_configured',
      service: serviceName,
      proxyTimeout: config.proxyTimeout,
      timeout: config.timeout
    }, `[Timeout] ${serviceName}: ${config.timeout / 1000}s`);
    return config;
  }

  /**
   * Inicializa todos los proxies de microservicios al arrancar el servicio
   * Esto previene la creación de nuevos proxies en cada petición (memory leak)
   * NOTA: Socket.IO (/socket.io) se maneja aparte con proxies frescos
   */
  initializeProxies() {
    this.logger.log({
      context: 'ProxyService',
      event: 'initializing_proxies'
    }, '[Inicio] Inicializando proxies de microservicios');

    // Crear proxy para cada microservicio que tenga baseUrl configurado
    Object.entries(services).forEach(([serviceName, serviceConfig]) => {
      // ✅ Validar que el servicio tenga baseUrl configurado
      if (!serviceConfig.baseUrl || serviceConfig.baseUrl.trim() === '') {
        this.logger.warn({
          context: 'ProxyService',
          event: 'proxy_skipped',
          service: serviceName,
          reason: 'baseUrl not configured'
        }, `[Skip] Proxy omitido para ${serviceName} (baseUrl no configurado)`);
        return; // Saltar este servicio
      }
      const proxy = this.createServiceProxy(serviceName, serviceConfig);
      this.proxyCache.set(serviceName, proxy);
      this.logger.debug({
        context: 'ProxyService',
        event: 'proxy_initialized',
        service: serviceName,
        target: serviceConfig.baseUrl
      }, `[Proxy] Proxy inicializado para ${serviceName}`);
    });
    this.logger.log({
      context: 'ProxyService',
      event: 'proxies_initialized',
      count: this.proxyCache.size
    }, `[Éxito] ${this.proxyCache.size} proxies inicializados correctamente`);
  }

  /**
   * Crea un proxy reutilizable para un microservicio específico
   */
  createServiceProxy(serviceName, serviceConfig) {
    const isWebSocketEnabled = false; // No hay microservicios con WebSockets en el sistema académico actualmente

    // ⏱️ TIMEOUTS PERSONALIZADOS POR MICROSERVICIO
    // Algunos microservicios necesitan más tiempo (reportes, Oracle, etc.)
    const timeoutConfig = this.getTimeoutForService(serviceName);
    const proxyOptions = {
      changeOrigin: true,
      target: serviceConfig.baseUrl,
      // Connection pooling: Reutiliza conexiones TCP para mejor performance
      agent: serviceConfig.baseUrl.startsWith('https://') ? httpsAgent : httpAgent,
      pathRewrite: path => {
        // Para Socket.IO NO reescribir la ruta (debe llegar como /socket.io)
        if (path.startsWith('/socket.io')) {
          return path; // Mantener /socket.io tal cual
        }

        // Para HTTP normal, quitar el nombre del microservicio de la ruta
        const segments = path.split('/').filter(segment => segment);
        return '/' + segments.slice(1).join('/');
      },
      headers: {
        'x-api-key': serviceConfig.apiKey
      },
      // Soporte WebSocket para red_social
      ws: isWebSocketEnabled,
      // Configuración de timeouts optimizada para 15K usuarios:
      // - Operaciones normales: 10s (suficiente para CRUD)
      // - Operaciones pesadas: 30s-60s (reportes, Oracle, etc.)
      // - Uploads: Manejados por middleware específico (60s)
      // - WebSocket: Sin timeout (conexiones persistentes)
      proxyTimeout: timeoutConfig.proxyTimeout,
      timeout: timeoutConfig.timeout,
      on: {
        proxyReqWs: (proxyReq, req, socket, options, head) => {
          // Log cuando se hace proxy de una conexión WebSocket
          this.logger.debug({
            context: 'ProxyService',
            event: 'websocket_proxy_request',
            microservice: serviceName,
            url: req.url
          }, `[WebSocket] Proxying WebSocket connection to ${serviceName}`);
        },
        error: (err, req, res) => {
          const isWebSocket = 'destroyed' in res && 'writable' in res && !('statusCode' in res);
          const errorMessage = err instanceof Error ? err.message : String(err);

          // Log diferenciado para WebSocket vs HTTP
          if (isWebSocket) {
            // Error de WebSocket - nivel DEBUG porque son esperados (heartbeat/ping-pong)
            // Solo se mostrarán si LOG_LEVEL=debug
            this.logger.debug({
              context: 'ProxyService',
              event: 'websocket_connection_closed',
              microservice: serviceName,
              error: errorMessage,
              errorType: 'WebSocket'
            }, `[WebSocket] Conexión WebSocket cerrada en ${serviceName} (heartbeat normal)`);
            return; // No podemos enviar respuesta HTTP a un WebSocket
          }

          // Error de HTTP - nivel ERROR porque son críticos
          this.logger.error({
            context: 'ProxyService',
            event: 'proxy_error',
            microservice: serviceName,
            error: errorMessage,
            errorType: 'HTTP',
            stack: err instanceof Error ? err.stack : undefined
          }, `[Error] Error en proxy HTTP de ${serviceName}`);

          // Verificar si ya se enviaron los headers
          if ('headersSent' in res && res.headersSent) {
            this.logger.warn({
              context: 'ProxyService',
              event: 'headers_already_sent',
              microservice: serviceName
            }, '[Advertencia] Headers ya enviados, no se puede enviar respuesta de error');
            return;
          }

          // Intentar usar métodos de Express primero
          const expressRes = res;
          if (typeof expressRes.status === 'function' && typeof expressRes.json === 'function') {
            // Es un Response de Express
            expressRes.status(500).json({
              error: 'Error inesperado',
              detalles: 'No se pudo procesar la solicitud'
            });
          } else if ('statusCode' in res && 'setHeader' in res && 'end' in res) {
            // Fallback para http.ServerResponse nativo
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: 'Error inesperado',
              detalles: 'No se pudo procesar la solicitud'
            }));
          }
        }
      }
    };

    // Crear el proxy middleware
    const proxyMiddleware = createProxyMiddleware(proxyOptions);
    return proxyMiddleware;
  }
  async processRequest(req, res) {
    const originalUrl = req.originalUrl || req.url || req.path || '';
    this.logger.debug({
      context: 'ProxyService',
      event: 'request_received',
      method: req.method,
      url: originalUrl
      // headers se omiten por seguridad (pueden contener tokens)
    }, `[Inicio] Petición recibida`);

    // 🔌 RUTA ESPECIAL PARA SOCKET.IO
    if (originalUrl.startsWith('/socket.io')) {
      throw new HttpException({
        error: 'Servicio de WebSocket no soportado en el sistema académico actualmente'
      }, HttpStatus.NOT_IMPLEMENTED);
    }

    // Extraer nombre del microservicio de la URL
    const segments = originalUrl.split('/').filter(segment => segment);
    if (segments.length < 1) {
      this.logger.debug({
        context: 'ProxyService',
        event: 'invalid_url_format',
        segments,
        originalUrl
      }, `[Error] Formato de URL inválido`);
      throw new HttpException({
        error: 'Formato de URL inválido',
        detalles: 'La URL debe contener al menos el nombre del microservicio y la ruta.'
      }, HttpStatus.BAD_REQUEST);
    }
    const microserviceName = segments[0];

    // 💚 RUTAS ADMINISTRATIVAS/INTERNAS (/api/*) - NO son microservicios
    // Estas rutas son manejadas por HealthController y AdminController
    // Si llegan aquí es porque el routing de NestJS no las capturó correctamente
    if (microserviceName === 'api') {
      this.logger.warn({
        context: 'ProxyService',
        event: 'admin_route_caught_by_proxy',
        url: originalUrl,
        segments
      }, `[Advertencia] Ruta administrativa /api/* fue capturada por ProxyController - esto no debería pasar`);

      // Devolver 404 porque esta ruta debería ser manejada por HealthController
      throw new HttpException({
        error: 'Ruta no encontrada',
        detalles: `La ruta administrativa ${originalUrl} no existe o no está disponible`
      }, HttpStatus.NOT_FOUND);
    }

    // Verificar que el microservicio existe
    if (!services[microserviceName]) {
      throw new HttpException({
        error: 'No se encontró el servicio',
        detalles: `No se encontró el servicio con el nombre ${microserviceName}`
      }, HttpStatus.NOT_FOUND);
    }

    // Re-escribir la ruta para quitar el prefijo del microservicio
    const urlParts = originalUrl.split('?');
    const pathOnly = urlParts[0];
    const queryOnly = urlParts[1] ? '?' + urlParts[1] : '';
    const pathSegments = pathOnly.split('/').filter(segment => segment);
    const rewrittenPath = '/' + pathSegments.slice(1).join('/') + queryOnly;
    const destination = services[microserviceName].baseUrl + rewrittenPath;

    this.logger.debug({
      context: 'ProxyService',
      event: 'proxying_request_fastify',
      microservice: microserviceName,
      destination
    }, `[Proxy] Enviando petición a ${destination} vía HTTP/2`);

    return res.from(destination, {
      rewriteRequestHeaders: (originalReq, headers) => {
        return {
          ...headers,
          'x-api-key': services[microserviceName].apiKey
        };
      }
    });
  }
}