import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import axios from 'axios';
import { securityValidationMap, services } from '../config/services.config';
import { CacheConfig } from '../config/cache.config';
import { httpAgent, httpsAgent, HTTP_TIMEOUTS } from '../config/http-client.config';
import { RedisService } from '../utils/redis.service';
import { Logger } from 'nestjs-pino';
@Injectable()
export class TokenMiddleware {
  constructor(@Inject(RedisService) redisService, @Inject(Logger) logger) {
    this.redisService = redisService;
    this.logger = logger;
  }
  async use(req, res, next) {
    if (process.env.ENV === 'dev') {
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'dev_mode_active'
      }, `[Dev] Modo desarrollo activo: token considerado válido.`);
      next();
      return;
    }
    const path = req.originalUrl || req.url || '';

    // IGNORAR rutas de health checks (públicas, sin autenticación)
    const healthCheckPaths = ['/api/health', '/api/ready', '/api/live'];
    if (healthCheckPaths.some(healthPath => path.startsWith(healthPath))) {
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'health_check_ignored',
        path
      }, '💚 Ruta de health check ignorada (pública)');
      next();
      return;
    }

    // IGNORAR favicon.ico que es del navegador
    if (path === '/favicon.ico') {
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'favicon_ignored'
      }, '🧢 Ruta favicon.ico ignorada');
      next();
      return;
    }

    // IGNORAR rutas de socket.io
    if (path.startsWith('/socket.io')) {
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'socketio_ignored'
      }, '🔌 Ruta /socket.io ignorada del middleware de token');
      next();
      return;
    }
    const segments = path.split('/').filter(Boolean);
    const microserviceName = segments[0];
    let securityModuleName = securityValidationMap[microserviceName];
    if (!securityModuleName || !services[securityModuleName]) {
      this.logger.warn({
        context: 'TokenMiddleware',
        event: 'security_module_not_found',
        microserviceName
      }, `❗ No se encontró módulo de seguridad para ${microserviceName}, se usará 'usuarios' por defecto`);
      securityModuleName = 'usuarios';
    }
    const seguridadService = services[securityModuleName];

    // Verificar si está en White List
    const isInWhiteList = await this.pathInWhiteList(path, seguridadService);
    if (isInWhiteList) {
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'whitelist_match',
        path
      }, `La ruta ${path} está en la White List. Se permite el acceso.`);
      next();
      return;
    }
    const token = req.headers['authorization'];
    if (!token) {
      this.logger.warn({
        context: 'TokenMiddleware',
        event: 'unauthorized_access_blocked',
        path,
        microserviceName
      }, `🚫 Acceso bloqueado: sin token - ${path}`);
      throw new UnauthorizedException('Solicitud no autorizada');
    }

    // ═══════════════════════════════════════════════════════════
    // CACHE DE VALIDACIÓN DE TOKENS
    // 1. Extraer la firma del token (última parte del JWT)
    // 2. Buscar en Redis si ya validamos este token
    // 3. Si existe en caché -> retornar inmediatamente (5ms)
    // 4. Si no existe -> validar con Seguridad y guardar (200ms)
    // ═══════════════════════════════════════════════════════════
    const tokenSignature = token.split('.')[2] || token.substring(0, 40);
    const cacheKey = `${CacheConfig.TOKEN_VALIDATION.KEY_PREFIX}${tokenSignature}`;
    try {
      // Intentar obtener validación desde caché
      const cachedValidation = await this.redisService.get(cacheKey);
      if (cachedValidation) {
        this.logger.debug({
          context: 'TokenMiddleware',
          event: 'token_validation_from_cache',
          path
        }, `⚡ Token validado desde caché (latencia ~5ms)`);

        // Usar datos del caché
        req['user'] = {
          identifier: cachedValidation.identifier,
          email: cachedValidation.email,
          sessionId: cachedValidation.sessionId
        };
        next();
        return;
      }

      // Si no está en caché, validar con el servicio de usuarios
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'token_validation_from_service',
        path
      }, `🔄 Token no en caché, validando con Usuarios...`);
      const url = `${seguridadService.baseUrl}/api/v1/auth/validate-token`;

      // Usar agente HTTP con connection pooling para reducir latencia
      const agent = url.startsWith('https://') ? httpsAgent : httpAgent;
      const response = await axios.post(url, {}, {
        headers: {
          'authorization': token,
          'x-api-key': seguridadService.apiKey
        },
        httpAgent: agent,
        httpsAgent: agent,
        timeout: HTTP_TIMEOUTS.CRITICAL // 3s para validación de token (crítico)
      });
      const valid = response.data;
      if (!valid || !valid.isValid) {
        this.logger.debug({
          context: 'TokenMiddleware',
          event: 'token_invalid',
          path
        }, `Token no válido`);
        throw new UnauthorizedException('Token no válido');
      }

      // Adjuntar información del usuario al request para rate limiting
      if (valid.identifier) {
        const userData = {
          identifier: valid.identifier,
          email: valid.email,
          sessionId: valid.sessionId
        };
        req['user'] = userData;

        // Guardar en caché por 5 minutos
        await this.redisService.set(cacheKey, userData, CacheConfig.TOKEN_VALIDATION.TTL);
        this.logger.debug({
          context: 'TokenMiddleware',
          event: 'user_authenticated_and_cached',
          identifier: valid.identifier,
          ttl: CacheConfig.TOKEN_VALIDATION.TTL
        }, `✅ Usuario autenticado y guardado en caché (TTL: ${CacheConfig.TOKEN_VALIDATION.TTL}s)`);
      }
      next();
    } catch (error) {
      // Detectar tipo de error para respuesta apropiada
      const isConnectionError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED';
      if (isConnectionError) {
        // Error de conexión con Seguridad (503 Service Unavailable)
        this.logger.error({
          context: 'TokenMiddleware',
          event: 'security_service_unavailable',
          error: error instanceof Error ? error.message : String(error),
          errorCode: error.code,
          path
        }, '❌ Servicio de Seguridad no disponible');

        // El HttpExceptionFilter detectará este mensaje y devolverá 503
        throw new UnauthorizedException('Error validando acceso: Servicio de autenticación no disponible');
      }

      // Otros errores (token inválido, etc.) → 401
      this.logger.error({
        context: 'TokenMiddleware',
        event: 'token_validation_error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        path
      }, '❌ Error validando token');
      throw new UnauthorizedException('Error validando acceso');
    }
  }
  async pathInWhiteList(path, seguridadService) {
    // ═══════════════════════════════════════════════════════════
    // WHITELIST GLOBAL: Una sola caché para todas las rutas
    // Configuración centralizada en CacheConfig
    // TTL: 24 horas (la whitelist cambia 1-2 veces/mes)
    // ═══════════════════════════════════════════════════════════
    const redisKey = CacheConfig.WHITELIST.KEY;
    const CACHE_TTL = CacheConfig.WHITELIST.TTL;
    let whiteList = await this.redisService.get(redisKey);
    if (!whiteList) {
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'whitelist_not_in_cache',
        redisKey
      }, `❌ No se encontró la White List en Redis (${redisKey}). Consultando en Seguridad...`);
      try {
        const whitelistUrl = `${seguridadService.baseUrl}/api/v1/whitelist/all`;
        const agent = whitelistUrl.startsWith('https://') ? httpsAgent : httpAgent;
        const {
          data
        } = await axios.get(whitelistUrl, {
          headers: {
            'x-api-key': seguridadService.apiKey
          },
          httpAgent: agent,
          httpsAgent: agent,
          timeout: HTTP_TIMEOUTS.NORMAL
        });
        whiteList = data;
        await this.redisService.set(redisKey, whiteList, CACHE_TTL);
        this.logger.debug({
          context: 'TokenMiddleware',
          event: 'whitelist_loaded_from_service',
          routesCount: whiteList.length,
          ttl: CACHE_TTL
        }, `✅ White List obtenida del servicio de Seguridad (${whiteList.length} rutas, TTL: ${CACHE_TTL}s)`);
      } catch (error) {
        this.logger.error({
          context: 'TokenMiddleware',
          event: 'whitelist_load_error',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, '❌ Error obteniendo la White List desde Seguridad');
        return false;
      }
    } else {
      this.logger.debug({
        context: 'TokenMiddleware',
        event: 'whitelist_from_cache',
        routesCount: whiteList.length
      }, `✅ White List obtenida desde Redis (${whiteList.length} rutas cacheadas)`);
    }
    const normalizedPath = path.split('?')[0].replace(/\/+$/, '');
    const matched = whiteList.some(route => normalizedPath === route.replace(/\/+$/, ''));
    this.logger.debug({
      context: 'TokenMiddleware',
      event: 'whitelist_comparison',
      normalizedPath,
      matched
    }, `🔍 Comparando ruta solicitada: '${normalizedPath}'`);
    this.logger.debug({
      context: 'TokenMiddleware',
      event: 'whitelist_result',
      matched
    }, `🔍 Resultado de comparación con White List: ${matched ? '✅ Coincide' : '❌ No coincide'}`);
    if (!matched) {
      this.logger.warn({
        context: 'TokenMiddleware',
        event: 'whitelist_no_match',
        normalizedPath
      }, `⚠️ La ruta '${normalizedPath}' no fue encontrada en la White List`);
    }
    return matched;
  }
}