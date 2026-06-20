import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
/**
 * Middleware de seguridad para endpoints administrativos
 * 
 * Protección de doble capa:
 * 1. IP Whitelist: Solo permite acceso desde IPs autorizadas
 * 2. API Key: Valida header x-admin-key con clave configurada en .env
 * 
 * USO:
 * - Solo accesible desde servidores internos (10.24.8.x)
 * - Requiere ADMIN_API_KEY en variables de entorno
 * - Ambas validaciones deben pasar para permitir acceso
 */
@Injectable()
export class AdminSecurityMiddleware {
  // IPs permitidas para acceder a endpoints administrativos
  ALLOWED_IPS = ['10.24.8.1',
  // Server 1 - API Gateway
  '10.24.8.2',
  // Server 2 - Microservicios
  '127.0.0.1',
  // localhost IPv4 (desarrollo)
  '::1',
  // localhost IPv6 (desarrollo)
  '::ffff:127.0.0.1' // localhost IPv4 mapeado a IPv6
  ];
  constructor() {
    this.adminApiKey = process.env.ADMIN_API_KEY;
    if (!this.adminApiKey) {
      console.error('⚠️  ADMIN_API_KEY no está configurada en variables de entorno');
      console.error('⚠️  Los endpoints administrativos estarán completamente bloqueados');
    }
  }
  use(req, res, next) {
    // 1. Validar IP
    const clientIp = this.getClientIp(req);
    if (!this.isIpAllowed(clientIp)) {
      console.warn(`🚫 Acceso administrativo bloqueado - IP no autorizada: ${clientIp}`);
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Acceso denegado: IP no autorizada',
        error: 'Forbidden',
        timestamp: new Date().toISOString(),
        path: req.url
      });
    }

    // 2. Validar API Key
    const apiKey = req.headers['x-admin-key'];
    if (!apiKey) {
      console.warn(`🚫 Acceso administrativo bloqueado - API Key no proporcionada (IP: ${clientIp})`);
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'API Key requerida en header x-admin-key',
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
        path: req.url
      });
    }
    if (!this.adminApiKey) {
      console.error(`🚫 Acceso administrativo bloqueado - ADMIN_API_KEY no configurada en servidor`);
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Servicio administrativo no disponible',
        error: 'Forbidden',
        timestamp: new Date().toISOString(),
        path: req.url
      });
    }
    if (apiKey !== this.adminApiKey) {
      console.warn(`🚫 Acceso administrativo bloqueado - API Key incorrecta (IP: ${clientIp})`);
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'API Key inválida',
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
        path: req.url
      });
    }

    // ✅ Ambas validaciones pasaron
    console.log(`✅ Acceso administrativo autorizado - IP: ${clientIp}, Path: ${req.method} ${req.url}`);
    next();
  }

  /**
   * Extrae la IP real del cliente considerando proxies y balanceadores
   */
  getClientIp(req) {
    // Orden de prioridad para detectar IP real:
    // 1. x-forwarded-for (cuando hay proxy/load balancer)
    // 2. x-real-ip (algunos proxies)
    // 3. req.ip (directo)
    // 4. req.connection.remoteAddress (fallback)

    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      // x-forwarded-for puede ser: "client, proxy1, proxy2"
      // Tomamos la primera IP (cliente real)
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return realIp;
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  /**
   * Verifica si la IP está en la whitelist
   */
  isIpAllowed(ip) {
    // Normalizar IP (eliminar prefijo IPv6 si es IPv4 mapeado)
    const normalizedIp = ip.replace('::ffff:', '');
    return this.ALLOWED_IPS.some(allowedIp => allowedIp === normalizedIp || allowedIp === ip);
  }
}