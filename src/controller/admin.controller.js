import { Controller, Delete, Get, Inject } from '@nestjs/common';
import { CacheConfig } from '../config/cache.config';
import { RedisService } from '../utils/redis.service';
import { Logger } from 'nestjs-pino';

/**
 * Controlador de administración del API Gateway
 * 
 * Endpoints para gestión de caché, health checks y operaciones administrativas
 * 
 * NOTA DE SEGURIDAD:
 * En producción, estos endpoints deberían estar protegidos con:
 * - IP Whitelist (solo desde red interna)
 * - API Key específica para administradores
 * - JWT con rol ADMIN
 * 
 * @author UTN-MOVIL
 * @date 31 de octubre de 2025
 */
@Controller('admin')
export class AdminController {
  constructor(@Inject(RedisService) redisService, @Inject(Logger) logger) {
    this.redisService = redisService;
    this.logger = logger;
  }

  /**
   * Invalida el cache de whitelist
   * 
   * Usar cuando se actualice la tabla MVL_TAB_WHITE_LIST en Oracle
   * para forzar que el gateway recargue la whitelist inmediatamente
   * sin esperar las 24 horas del TTL.
   * 
   * Flujo recomendado al actualizar whitelist:
   * 1. Actualizar tabla Oracle (INSERT/UPDATE/DELETE en MVL_TAB_WHITE_LIST)
   * 2. Llamar a este endpoint para invalidar cache
   * 3. El próximo request al gateway recargará automáticamente la whitelist
   * 
   * @example
   * ```bash
   * # Desde línea de comandos
   * curl -X DELETE http://10.24.8.46:3000/admin/cache/whitelist
   * 
   * # Desde PowerShell
   * Invoke-RestMethod -Uri "http://10.24.8.46:3000/admin/cache/whitelist" -Method Delete
   * ```
   * 
   * @returns Resultado de la operación con número de claves eliminadas
   */
  @Delete('cache/whitelist')
  async invalidateWhitelistCache() {
    try {
      const cacheKey = CacheConfig.WHITELIST.KEY;
      const deleted = await this.redisService.del(cacheKey);
      this.logger.log({
        context: 'AdminController',
        event: 'whitelist_cache_invalidated',
        cacheKey,
        keysDeleted: deleted
      }, `✅ Cache de whitelist invalidado (clave: ${cacheKey}, eliminadas: ${deleted})`);
      return {
        success: true,
        message: 'Cache de whitelist invalidado exitosamente',
        cacheKey: cacheKey,
        keysDeleted: deleted,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error({
        context: 'AdminController',
        event: 'whitelist_cache_invalidation_error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, '❌ Error invalidando cache de whitelist');
      return {
        success: false,
        message: 'Error invalidando cache de whitelist',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Obtiene estadísticas del cache de whitelist
   * 
   * Permite verificar si el cache existe y cuánto tiempo falta para su expiración
   * 
   * @example
   * ```bash
   * curl http://10.24.8.46:3000/admin/cache/whitelist/stats
   * ```
   * 
   * @returns Estadísticas del cache (existe, TTL restante, tamaño, etc.)
   */
  @Get('cache/whitelist/stats')
  async getWhitelistCacheStats() {
    try {
      const cacheKey = CacheConfig.WHITELIST.KEY;
      const cachedData = await this.redisService.get(cacheKey);
      if (!cachedData) {
        return {
          success: true,
          exists: false,
          message: 'Cache de whitelist no existe (próximo request lo creará)',
          cacheKey: cacheKey,
          timestamp: new Date().toISOString()
        };
      }

      // Si el cache existe, obtener información
      const routesCount = Array.isArray(cachedData) ? cachedData.length : 0;
      return {
        success: true,
        exists: true,
        message: 'Cache de whitelist activo',
        cacheKey: cacheKey,
        routesCount: routesCount,
        configuredTTL: `${CacheConfig.WHITELIST.TTL} segundos (${CacheConfig.WHITELIST.TTL / 3600} horas)`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error({
        context: 'AdminController',
        event: 'whitelist_cache_stats_error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, '❌ Error obteniendo estadísticas de cache');
      return {
        success: false,
        message: 'Error obteniendo estadísticas de cache',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Health check del controlador de administración
   * 
   * @example
   * ```bash
   * curl http://10.24.8.46:3000/admin/health
   * ```
   */
  @Get('health')
  async health() {
    return {
      status: 'ok',
      service: 'Admin Controller',
      timestamp: new Date().toISOString()
    };
  }
}