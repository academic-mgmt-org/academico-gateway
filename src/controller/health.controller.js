import { Controller, Get, Inject } from '@nestjs/common';
import { RedisService } from '../utils/redis.service';
/**
 * Health Check Controller
 * 
 * Endpoint público para verificar el estado del API Gateway.
 * Usado por:
 * - Docker healthcheck
 * - Traefik healthcheck
 * - Kubernetes liveness/readiness probes
 * - Monitoreo externo (Uptime Robot, Pingdom, etc.)
 * 
 * IMPORTANTE: Este endpoint NO debe estar protegido por autenticación
 * ni rate limiting para que los health checks funcionen correctamente.
 * 
 * @author UTN-MOVIL
 * @date 22 de noviembre de 2025
 */
@Controller('api')
export class HealthController {
  constructor(@Inject(RedisService) redisService) {
    this.redisService = redisService;
  }

  /**
   * Health check principal
   * 
   * Verifica:
   * 1. El servidor está respondiendo (HTTP 200)
   * 2. Redis está conectado (crítico para caché y rate limiting)
   * 
   * Respuestas:
   * - 200 OK: Todo funcional
   * - 503 Service Unavailable: Redis no disponible (crítico)
   * 
   * @example
   * ```bash
   * # Desde línea de comandos
   * curl http://localhost:3000/api/health
   * 
   * # Desde PowerShell
   * Invoke-RestMethod -Uri "http://localhost:3000/api/health"
   * 
   * # Con wget (usado por Docker healthcheck)
   * wget --quiet --tries=1 --spider http://localhost:3000/api/health
   * ```
   * 
   * @returns Estado del servicio
   */
  @Get('health')
  async health() {
    // Verificar conexión a Redis
    let redisStatus = 'unknown';
    try {
      const redisAlive = await this.redisService.ping();
      if (!redisAlive) {
        throw new Error('Redis PING no respondio PONG');
      }
      redisStatus = 'connected';
    } catch (error) {
      redisStatus = 'disconnected';
      // Redis disconnected es CRÍTICO porque sin Redis:
      // - No hay rate limiting (vulnerable a DDoS)
      // - No hay caché de tokens (latencia alta, sobrecarga a Seguridad)
      // - No hay caché de whitelist (sobrecarga a Oracle)
      return {
        status: 'unhealthy',
        service: 'UTN-MOVIL API Gateway',
        redis: redisStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        message: 'Redis no disponible - Servicio degradado'
      };
    }

    // Todo OK
    return {
      status: 'healthy',
      service: 'UTN-MOVIL API Gateway',
      redis: redisStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Readiness probe (Kubernetes)
   * 
   * Indica si el servicio está LISTO para recibir tráfico.
   * Más estricto que liveness (puede estar "alive" pero no "ready").
   * 
   * @returns Estado de readiness
   */
  @Get('ready')
  async ready() {
    // Verificar dependencias críticas
    let redisReady = false;
    try {
      await this.redisService.get('readiness_check');
      redisReady = true;
    } catch (error) {
      // Redis no listo
    }
    const isReady = redisReady;
    if (!isReady) {
      return {
        ready: false,
        redis: redisReady,
        message: 'Servicio no listo para recibir tráfico',
        timestamp: new Date().toISOString()
      };
    }
    return {
      ready: true,
      redis: redisReady,
      message: 'Servicio listo para recibir tráfico',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Liveness probe (Kubernetes)
   * 
   * Indica si el servicio está VIVO (proceso corriendo).
   * Si falla, Kubernetes reinicia el pod.
   * 
   * @returns Estado de liveness
   */
  @Get('live')
  async live() {
    // Si llegamos aquí, el proceso está vivo
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}
