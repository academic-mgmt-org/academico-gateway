import { Injectable, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import { rateLimitConfig, RATE_LIMIT_REDIS_PREFIX } from '../config/rate-limit.config';
import { RedisService } from '../utils/redis.service';

/**
 * Rate Limiting Middleware - CAPA 3: Uploads de Archivos
 * 
 * Control específico para operaciones de upload de archivos.
 * Protege recursos de almacenamiento y procesamiento.
 * 
 * Límite: 10 uploads por hora por usuario
 * Algoritmo: Simple Counter con TTL
 * Scope: Solo requests de upload (multipart/form-data)
 */
@Injectable()
export class RateLimitUploadMiddleware {
  logger = new Logger(RateLimitUploadMiddleware.name);
  constructor(@Inject(RedisService) redisService) {
    this.redisService = redisService;
  }
  async use(req, _res, next) {
    // Si rate limiting de uploads está deshabilitado, continuar
    if (!rateLimitConfig.upload.enabled) {
      return next();
    }
    try {
      // Verificar si es una operación de upload
      if (!this.isUploadRequest(req)) {
        // No es upload, skip este middleware
        return next();
      }

      // Verificar si hay usuario autenticado
      const user = req['user'];
      if (!user || !user.identifier) {
        // Sin usuario autenticado, skip (probablemente ya bloqueado por TokenMiddleware)
        this.logger.debug('⚪ Upload sin autenticación detectado');
        return next();
      }
      const identifier = user.identifier;

      // Generar clave única para uploads de este usuario
      const redisKey = `${RATE_LIMIT_REDIS_PREFIX.UPLOAD}${identifier}`;

      // Obtener contador actual
      const currentCount = await this.redisService.getCounter(redisKey);

      // Verificar si excede el límite
      if (currentCount >= rateLimitConfig.upload.max) {
        this.logger.warn(`🚫 Rate limit de uploads excedido: ${identifier} (${currentCount}/${rateLimitConfig.upload.max} uploads en ${rateLimitConfig.upload.windowSeconds / 3600}h)`);
        throw new HttpException({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: rateLimitConfig.upload.message.error,
          message: rateLimitConfig.upload.message.message,
          limit: rateLimitConfig.upload.max,
          window: `${rateLimitConfig.upload.windowSeconds / 3600} hora(s)`,
          retryAfter: rateLimitConfig.upload.windowSeconds
        }, HttpStatus.TOO_MANY_REQUESTS, {
          cause: new Error(`Upload rate limit exceeded for user: ${identifier}`)
        });
      }

      // Incrementar contador
      const newCount = await this.redisService.incr(redisKey);

      // Si es el primer upload, establecer TTL
      if (newCount === 1) {
        await this.redisService.expire(redisKey, rateLimitConfig.upload.windowSeconds);
        this.logger.debug(`🆕 Primera upload de la ventana para ${identifier}`);
      }

      // Logging para monitoreo
      this.logger.log(`📤 Upload permitido: ${identifier} (${newCount}/${rateLimitConfig.upload.max} en ventana actual)`);

      // Advertir si está cerca del límite
      if (newCount >= rateLimitConfig.upload.max * 0.8) {
        this.logger.warn(`⚠️ Usuario cerca del límite de uploads: ${identifier} (${newCount}/${rateLimitConfig.upload.max})`);
      }
      next();
    } catch (error) {
      // Si el error es HttpException (rate limit), propagarlo
      if (error instanceof HttpException) {
        throw error;
      }

      // Si hay error con Redis, loguear pero permitir request (fail-open)
      this.logger.error('❌ Error en rate limiting de uploads:', error);
      next();
    }
  }

  /**
   * Detectar si el request es una operación de upload
   * 
   * Implementa detección multicapa:
   * 1. Content-Type: multipart/form-data (método estándar)
   * 2. Content-Length: payloads grandes (anti-spoofing)
   * 3. Path pattern: rutas conocidas de upload
   * 
   * @param req Request de Express
   * @returns true si es upload, false en caso contrario
   */
  isUploadRequest(req) {
    // 1. Verificar Content-Type (detección estándar)
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      this.logger.debug('📤 Upload detectado por Content-Type: multipart/form-data');
      return true;
    }

    // 2. Verificar método (solo POST/PUT pueden subir archivos)
    const method = req.method.toUpperCase();
    if (method !== 'POST' && method !== 'PUT') {
      return false;
    }

    // 3. PROTECCIÓN ANTI-SPOOFING: Detectar payloads grandes por tamaño
    // Aunque el Content-Type diga "application/json", si el payload es > 1MB
    // probablemente sea un archivo (anti-bypass de rate limit)
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const LARGE_PAYLOAD_THRESHOLD = 1_000_000; // 1 MB

    if (contentLength > LARGE_PAYLOAD_THRESHOLD) {
      this.logger.warn(`⚠️ Payload grande detectado (posible upload encubierto): ${(contentLength / 1_000_000).toFixed(2)} MB - Content-Type: ${contentType}`);
      return true; // Contar como upload aunque no sea multipart
    }

    // 4. Verificar rutas comunes de upload (heurística adicional)
    const path = req.originalUrl || req.url;
    const uploadPathPatterns = ['/upload', '/file', '/archivo', '/imagen', '/document', '/attachment', '/media'];
    const matchesPath = uploadPathPatterns.some(pattern => path.toLowerCase().includes(pattern));
    if (matchesPath) {
      this.logger.debug(`📤 Upload detectado por ruta: ${path}`);
      return true;
    }
    return false;
  }
}