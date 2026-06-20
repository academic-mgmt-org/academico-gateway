import { Injectable } from '@nestjs/common';
/**
 * Security Headers Middleware
 * 
 * Aplica headers de seguridad estándar a TODAS las respuestas HTTP.
 * Protege contra ataques comunes en aplicaciones web.
 * 
 * Headers implementados:
 * - X-Frame-Options: Previene Clickjacking
 * - X-Content-Type-Options: Previene MIME Sniffing
 * - Strict-Transport-Security: Fuerza HTTPS
 * - X-XSS-Protection: Protección XSS (navegadores legacy)
 * - Referrer-Policy: Controla información de referrer
 * - Content-Security-Policy: Previene inyección de scripts
 * - Permissions-Policy: Restringe APIs del navegador
 * 
 * @author UTN-MOVIL
 * @date 22 de noviembre de 2025
 */
@Injectable()
export class SecurityHeadersMiddleware {
  use(req, res, next) {
    // ════════════════════════════════════════════════════════════
    // PROTECCIÓN ANTI-CLICKJACKING
    // ════════════════════════════════════════════════════════════
    // Previene que tu API sea cargada en un iframe malicioso
    // SAMEORIGIN: Solo permite iframes del mismo dominio
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // ════════════════════════════════════════════════════════════
    // PROTECCIÓN ANTI-MIME SNIFFING
    // ════════════════════════════════════════════════════════════
    // Previene que el navegador "adivine" el tipo de contenido
    // Fuerza a usar el Content-Type declarado
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ════════════════════════════════════════════════════════════
    // FORZAR HTTPS (HSTS)
    // ════════════════════════════════════════════════════════════
    // max-age: 1 año (31536000 segundos)
    // includeSubDomains: Aplica a todos los subdominios
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // ════════════════════════════════════════════════════════════
    // PROTECCIÓN XSS (Cross-Site Scripting)
    // ════════════════════════════════════════════════════════════
    // Activa el filtro XSS integrado del navegador
    // Nota: Deprecated en navegadores modernos, pero no hace daño
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // ════════════════════════════════════════════════════════════
    // CONTROL DE REFERRER
    // ════════════════════════════════════════════════════════════
    // strict-origin-when-cross-origin: No envía datos sensibles en el referer
    // Previene information leaking a sitios externos
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ════════════════════════════════════════════════════════════
    // CONTENT SECURITY POLICY (CSP)
    // ════════════════════════════════════════════════════════════
    // Para API Gateway (solo JSON), CSP restrictivo:
    // - default-src 'self': Solo carga recursos del mismo origen
    // - frame-ancestors 'none': No puede ser embebido en iframes (refuerza X-Frame-Options)
    // - base-uri 'self': Previene ataques de <base> tag hijacking
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';");

    // ════════════════════════════════════════════════════════════
    // PERMISSIONS POLICY (Feature Policy)
    // ════════════════════════════════════════════════════════════
    // Deshabilita APIs del navegador que no necesita un API Gateway:
    // - geolocation, microphone, camera: Previene acceso a hardware
    // - payment: Previene activación de APIs de pago
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    next();
  }
}