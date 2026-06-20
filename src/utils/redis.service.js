import { Injectable, Inject } from '@nestjs/common';
import { createClient } from 'redis';
import { Logger } from 'nestjs-pino';
@Injectable()
export class RedisService {
  constructor(@Inject(Logger) logger) {
    this.logger = logger;
  }
  async onModuleInit() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || 6379;
    const redisUrl = `redis://${redisHost}:${redisPort}`;
    this.redisClient = createClient({
      url: redisUrl
    });
    this.redisClient.on('error', err => {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_error',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      }, '🚨 Redis Gateway Error');
    });
    try {
      await this.redisClient.connect();
      this.logger.log({
        context: 'RedisService',
        event: 'redis_connected',
        redisHost,
        redisPort
      }, '✅ Redis conectado exitosamente en el API Gateway');
    } catch (err) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_connection_error_critical',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        redisHost,
        redisPort
      }, '❌ CRÍTICO: Redis no disponible - El Gateway NO puede funcionar sin caché y rate limiting');

      // FAIL-FAST: Sin Redis no hay rate limiting → riesgo de DDoS
      // Mejor forzar restart del contenedor para reintentar conexión
      this.logger.error({
        context: 'RedisService',
        event: 'application_shutdown',
        reason: 'redis_unavailable'
      }, '💀 Forzando shutdown de la aplicación (Docker reiniciará el contenedor)');
      process.exit(1);
    }
  }
  async get(key) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'get',
        key
      }, '❌ Redis no está inicializado');
      return null;
    }
    const data = await this.redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }
  async set(key, value, ttl) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'set',
        key
      }, '❌ Redis no está inicializado');
      return;
    }
    await this.redisClient.set(key, JSON.stringify(value));
    if (ttl) await this.redisClient.expire(key, ttl);
  }
  async del(key) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'del',
        key
      }, '❌ Redis no está inicializado');
      return;
    }
    await this.redisClient.del(key);
  }

  // ═══════════════════════════════════════════════════════════
  // MÉTODOS PARA RATE LIMITING (Sorted Sets y Counters)
  // ═══════════════════════════════════════════════════════════

  /**
   * Agregar elemento a un Sorted Set (usado para sliding window rate limiting)
   * @param key Clave del sorted set
   * @param score Score del elemento (timestamp)
   * @param member Miembro a agregar
   */
  async zadd(key, score, member) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'zadd',
        key
      }, '❌ Redis no está inicializado');
      return 0;
    }
    return await this.redisClient.zAdd(key, {
      score,
      value: member
    });
  }

  /**
   * Eliminar elementos de un Sorted Set por rango de score
   * @param key Clave del sorted set
   * @param min Score mínimo
   * @param max Score máximo
   */
  async zremrangebyscore(key, min, max) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'zremrangebyscore',
        key
      }, '❌ Redis no está inicializado');
      return 0;
    }
    return await this.redisClient.zRemRangeByScore(key, min, max);
  }

  /**
   * Contar elementos en un Sorted Set
   * @param key Clave del sorted set
   */
  async zcard(key) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'zcard',
        key
      }, '❌ Redis no está inicializado');
      return 0;
    }
    return await this.redisClient.zCard(key);
  }

  /**
   * Incrementar un contador
   * @param key Clave del counter
   */
  async incr(key) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'incr',
        key
      }, '❌ Redis no está inicializado');
      return 0;
    }
    return await this.redisClient.incr(key);
  }

  /**
   * Establecer expiración de una clave
   * @param key Clave
   * @param seconds Segundos hasta expiración
   */
  async expire(key, seconds) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'expire',
        key
      }, '❌ Redis no está inicializado');
      return false;
    }
    return await this.redisClient.expire(key, seconds);
  }

  /**
   * Obtener valor de un counter
   * @param key Clave del counter
   */
  async getCounter(key) {
    if (!this.redisClient) {
      this.logger.error({
        context: 'RedisService',
        event: 'redis_not_initialized',
        operation: 'getCounter',
        key
      }, '❌ Redis no está inicializado');
      return 0;
    }
    const value = await this.redisClient.get(key);
    return value ? parseInt(value, 10) : 0;
  }
}