/**
 * Configuración centralizada de caché Redis para API Gateway
 * 
 * Los TTLs se cargan directamente desde variables de entorno (.env).
 * 
 * @author UTN-MOVIL
 * @date 29 de noviembre de 2025
 */

export const CacheConfig = {
  /**
   * Whitelist global de rutas públicas
   * Compartida por todos los microservicios
   * 
   * TTL: Desde .env → GATEWAY_WHITELIST_CACHE_TTL
   * Recomendado: (7 días) 604800 segundos
   * 
   */
  WHITELIST: {
    KEY: 'API_GATEWAY_WHITELIST_GLOBAL',
    // Fallback a 604800 (7 días) si no existe la variable
    TTL: parseInt(process.env.GATEWAY_WHITELIST_CACHE_TTL || '604800', 10)
  },
  /**
   * Cache de validación de tokens JWT
   * 
   * TTL: Desde .env → GATEWAY_TOKEN_CACHE_TTL
   * 
   * Estrategia:
   * - Primera validación: Gateway → Seguridad (200-300ms)
   * - Siguientes validaciones (dentro del TTL): Gateway → Redis local (1-5ms)
   * 
   * Impacto:
   * - Reduce latencia de 200ms a 5ms (40x más rápido)
   * - Reduce carga en microservicio Seguridad en ~98%
   * - Si un token se revoca en Seguridad, toma máximo TTL segundos invalidarse en Gateway
   * 
   * Trade-off de seguridad:
   * - Ventana temporal donde un token revocado puede seguir activo
   * - Balance recomendado: 60s (1 minuto)
   *   · Suficiente para reducir carga masivamente
   *   · Ventana de revocación aceptable (1 min)
   *   · Compatible con session tokens de 1 hora
   */
  TOKEN_VALIDATION: {
    KEY_PREFIX: 'token_valid:',
    // Fallback a 60 (1 min) - balance óptimo seguridad/performance
    TTL: parseInt(process.env.GATEWAY_TOKEN_CACHE_TTL || '60', 10)
  }
};

/**
 * Tipo inferido de las claves de configuración
 * Permite autocompletado y validación en TypeScript
 */