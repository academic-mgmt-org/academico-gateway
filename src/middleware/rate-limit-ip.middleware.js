import { Injectable, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import { rateLimitConfig, RATE_LIMIT_REDIS_PREFIX } from '../config/rate-limit.config';
import { RedisService } from '../utils/redis.service';

/**
 * Rate Limiting Middleware - CAPA 1: Por IP
 * 
 * Protección global contra ataques DDoS y abuso masivo desde una sola IP.
 * Se aplica ANTES de la validación de token para proteger recursos.
 * 
 * Límite: 10,000 req/min por IP (alto debido a IPs compartidas en EDUROAM)
 * Algoritmo: Sliding Window usando Redis Sorted Set
 */
@Injectable()
export class RateLimitIpMiddleware {
  logger = new Logger(RateLimitIpMiddleware.name);
  constructor(@Inject(RedisService) redisService) {
    this.redisService = redisService;
  }
  async use(req, _res, next) {
    // Si rate limiting por IP está deshabilitado, continuar
    if (!rateLimitConfig.ip.enabled) {
      return next();
    }
    try {
      // Extraer IP del cliente (considerar proxy/load balancer)
      const ip = this.getClientIp(req);
      if (!ip) {
        this.logger.warn('⚠️ No se pudo determinar la IP del cliente');
        return next();
      }

      // Generar clave única para esta IP
      const redisKey = `${RATE_LIMIT_REDIS_PREFIX.IP}${ip}`;

      // Timestamp actual en segundos
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - rateLimitConfig.ip.windowSeconds;

      // Implementar Sliding Window Algorithm con Redis Sorted Set
      // 1. Eliminar requests antiguos (fuera de la ventana)
      await this.redisService.zremrangebyscore(redisKey, 0, windowStart);

      // 2. Agregar request actual
      const requestId = `${now}-${Math.random()}`;
      await this.redisService.zadd(redisKey, now, requestId);

      // 3. Contar requests en la ventana
      const requestCount = await this.redisService.zcard(redisKey);

      // 4. Establecer TTL para auto-limpieza
      await this.redisService.expire(redisKey, rateLimitConfig.ip.windowSeconds + 10);

      // 5. Verificar si excede el límite
      if (requestCount > rateLimitConfig.ip.max) {
        this.logger.warn(`🚫 Rate limit por IP excedido: ${ip} (${requestCount}/${rateLimitConfig.ip.max} req en ${rateLimitConfig.ip.windowSeconds}s)`);
        throw new HttpException({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: rateLimitConfig.ip.message.error,
          message: rateLimitConfig.ip.message.message,
          limit: rateLimitConfig.ip.max,
          window: `${rateLimitConfig.ip.windowSeconds} segundos`,
          retryAfter: rateLimitConfig.ip.windowSeconds
        }, HttpStatus.TOO_MANY_REQUESTS, {
          cause: new Error(`Rate limit exceeded for IP: ${ip}`)
        });
      }

      // Logging para monitoreo (solo si está cerca del límite)
      if (requestCount > rateLimitConfig.ip.max * 0.8) {
        this.logger.debug(`⚠️ IP cerca del límite: ${ip} (${requestCount}/${rateLimitConfig.ip.max})`);
      }
      next();
    } catch (error) {
      // Si el error es HttpException (rate limit), propagarlo
      if (error instanceof HttpException) {
        throw error;
      }

      // Si hay error con Redis, loguear pero permitir request (fail-open)
      this.logger.error('❌ Error en rate limiting por IP:', error);
      next();
    }
  }

  /**
   * Extraer IP del cliente considerando proxies y load balancers
   * @param req Request de Express
   * @returns IP del cliente
   */
  getClientIp(req) {
    // 1. Verificar header X-Forwarded-For (proxy/load balancer)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For puede tener múltiples IPs separadas por coma
      const ips = typeof forwardedFor === 'string' ? forwardedFor.split(',').map(ip => ip.trim()) : forwardedFor;

      // Retornar la primera IP (cliente original)
      return Array.isArray(ips) ? ips[0] : ips;
    }

    // 2. Verificar header X-Real-IP (algunos proxies)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return typeof realIp === 'string' ? realIp : realIp[0];
    }

    // 3. Usar IP de la conexión directa
    return req.ip || req.socket.remoteAddress || null;
  }
}