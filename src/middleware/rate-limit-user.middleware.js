import { Injectable, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import { rateLimitConfig, RATE_LIMIT_REDIS_PREFIX } from '../config/rate-limit.config';
import { RedisService } from '../utils/redis.service';

/**
 * Rate Limiting Middleware - CAPA 2: Por Usuario Autenticado
 * 
 * Control de abuso individual basado en el identifier del usuario.
 * Se aplica DESPUÉS de TokenMiddleware (requiere req.user).
 * 
 * Límite: 100 req/min por usuario
 * Algoritmo: Sliding Window usando Redis Sorted Set
 * Scope: Solo rutas autenticadas (skip si no hay req.user)
 */
@Injectable()
export class RateLimitUserMiddleware {
  logger = new Logger(RateLimitUserMiddleware.name);
  constructor(@Inject(RedisService) redisService) {
    this.redisService = redisService;
  }
  async use(req, _res, next) {
    // Si rate limiting por usuario está deshabilitado, continuar
    if (!rateLimitConfig.user.enabled) {
      return next();
    }
    try {
      // Verificar si hay usuario autenticado (agregado por TokenMiddleware)
      const user = req['user'];
      if (!user || !user.identifier) {
        // Ruta pública o whitelist, no aplicar rate limit por usuario
        this.logger.debug('⚪ Ruta sin autenticación, skip rate limit por usuario');
        return next();
      }
      const identifier = user.identifier;

      // Generar clave única para este usuario
      const redisKey = `${RATE_LIMIT_REDIS_PREFIX.USER}${identifier}`;

      // Timestamp actual en segundos
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - rateLimitConfig.user.windowSeconds;

      // Implementar Sliding Window Algorithm con Redis Sorted Set
      // 1. Eliminar requests antiguos (fuera de la ventana)
      await this.redisService.zremrangebyscore(redisKey, 0, windowStart);

      // 2. Agregar request actual
      const requestId = `${now}-${Math.random()}`;
      await this.redisService.zadd(redisKey, now, requestId);

      // 3. Contar requests en la ventana
      const requestCount = await this.redisService.zcard(redisKey);

      // 4. Establecer TTL para auto-limpieza
      await this.redisService.expire(redisKey, rateLimitConfig.user.windowSeconds + 10);

      // 5. Verificar si excede el límite
      if (requestCount > rateLimitConfig.user.max) {
        this.logger.warn(`🚫 Rate limit por usuario excedido: ${identifier} (${requestCount}/${rateLimitConfig.user.max} req en ${rateLimitConfig.user.windowSeconds}s)`);
        throw new HttpException({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: rateLimitConfig.user.message.error,
          message: rateLimitConfig.user.message.message,
          limit: rateLimitConfig.user.max,
          window: `${rateLimitConfig.user.windowSeconds} segundos`,
          retryAfter: rateLimitConfig.user.windowSeconds
        }, HttpStatus.TOO_MANY_REQUESTS, {
          cause: new Error(`Rate limit exceeded for user: ${identifier}`)
        });
      }

      // Logging para monitoreo (solo si está cerca del límite)
      if (requestCount > rateLimitConfig.user.max * 0.8) {
        this.logger.debug(`⚠️ Usuario cerca del límite: ${identifier} (${requestCount}/${rateLimitConfig.user.max})`);
      } else {
        this.logger.debug(`✅ Rate limit OK: ${identifier} (${requestCount}/${rateLimitConfig.user.max})`);
      }
      next();
    } catch (error) {
      // Si el error es HttpException (rate limit), propagarlo
      if (error instanceof HttpException) {
        throw error;
      }

      // Si hay error con Redis, loguear pero permitir request (fail-open)
      this.logger.error('❌ Error en rate limiting por usuario:', error);
      next();
    }
  }
}