/**
 * Configuración de Rate Limiting
 * 
 * Sistema de protección multicapa:
 * - CAPA 1: Límite global por IP (protección anti-DDoS)
 * - CAPA 2: Límite por usuario autenticado (control de abuso individual)
 * - CAPA 3: Límite de uploads por usuario (protección de recursos)
 */

export const rateLimitConfig = {
  // ═══════════════════════════════════════════════════════════
  // CAPA 1: RATE LIMIT GLOBAL POR IP
  // ═══════════════════════════════════════════════════════════
  ip: {
    enabled: process.env.RATE_LIMIT_IP_ENABLED !== 'false',
    // Habilitado por defecto
    max: parseInt(process.env.RATE_LIMIT_IP_MAX || '10000', 10),
    // 10,000 req/min
    windowSeconds: parseInt(process.env.RATE_LIMIT_IP_WINDOW || '60', 10),
    // 60 segundos
    message: {
      error: 'Demasiadas peticiones desde esta red',
      message: 'Se ha excedido el límite de peticiones desde tu red. Si estás conectado a EDUROAM, esto puede deberse a la alta carga de múltiples usuarios. Por favor espera un momento antes de continuar.'
    }
  },
  // ═══════════════════════════════════════════════════════════
  // CAPA 2: RATE LIMIT POR USUARIO AUTENTICADO
  // ═══════════════════════════════════════════════════════════
  user: {
    enabled: process.env.RATE_LIMIT_USER_ENABLED !== 'false',
    // Habilitado por defecto
    max: parseInt(process.env.RATE_LIMIT_USER_MAX || '300', 10),
    // 300 req/min (5 req/s) - Optimizado para 15K usuarios
    windowSeconds: parseInt(process.env.RATE_LIMIT_USER_WINDOW || '60', 10),
    // 60 segundos
    message: {
      error: 'Límite de peticiones excedido',
      message: 'Has realizado demasiadas peticiones. Por favor espera un momento antes de continuar.'
    }
  },
  // ═══════════════════════════════════════════════════════════
  // CAPA 3: RATE LIMIT DE UPLOADS
  // ═══════════════════════════════════════════════════════════
  upload: {
    enabled: process.env.RATE_LIMIT_UPLOAD_ENABLED !== 'false',
    // Habilitado por defecto
    max: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '50', 10),
    // 50 uploads/hora - Aumentado para usuarios activos
    windowSeconds: parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW || '3600', 10),
    // 1 hora
    message: {
      error: 'Límite de uploads excedido',
      message: 'Has alcanzado el límite de archivos por hora. Por favor espera antes de subir más archivos.'
    }
  }
};

/**
 * Prefijos de claves Redis para rate limiting
 */
export const RATE_LIMIT_REDIS_PREFIX = {
  IP: 'rate_limit:ip:',
  USER: 'rate_limit:user:',
  UPLOAD: 'rate_limit:upload:'
};