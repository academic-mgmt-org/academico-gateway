import { Agent } from 'http';
import { Agent as HttpsAgent } from 'https';

/**
 * Configuración de HTTP/HTTPS Agents con Connection Pooling
 * 
 * Optimizado para:
 * - 15,000 usuarios concurrentes
 * - Múltiples microservicios (Seguridad, Estudiante, Docente, etc.)
 * - Reducción de latencia por reutilización de conexiones TCP
 * 
 * Beneficios:
 * - Evita crear nueva conexión TCP en cada request (ahorra ~50ms)
 * - Reutiliza conexiones mediante HTTP Keep-Alive
 * - Previene saturación de file descriptors del SO
 * - Reduce carga en microservicios (menos handshakes TCP/TLS)
 * 
 * @see https://nodejs.org/api/http.html#http_class_http_agent
 */

/**
 * HTTP Agent para conexiones no seguras (http://)
 * 
 * Configuración:
 * - keepAlive: Mantiene conexiones abiertas para reutilización
 * - keepAliveMsecs: 30s antes de enviar TCP keep-alive probe
 * - maxSockets: 100 conexiones simultáneas por host (suficiente para 15K usuarios)
 * - maxFreeSockets: 10 conexiones idle en pool (balance memoria/performance)
 * - timeout: 60s timeout de socket (para operaciones lentas como Microsoft Azure AD)
 */
export const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 10000
});

/**
 * HTTPS Agent para conexiones seguras (https://)
 * 
 * Misma configuración que HTTP Agent
 * Importante para conexiones TLS con microservicios externos
 */
export const httpsAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 10000
});

/**
 * Configuración de timeouts para requests HTTP
 * 
 * Estrategia de timeouts escalonada:
 * - CRITICAL: 3s (endpoints críticos como validación de token)
 * - NORMAL: 10s (operaciones normales de CRUD)
 * - UPLOAD: 60s (uploads de archivos grandes)
 */
export const HTTP_TIMEOUTS = {
  /** Timeout para operaciones críticas (validación token, health checks) */
  CRITICAL: 3000,
  /** Timeout para operaciones normales (CRUD, consultas) */
  NORMAL: 10000,
  /** Timeout para uploads de archivos */
  UPLOAD: 60000
};

/**
 * Tipo inferido de timeouts
 */

/**
 * Función helper para obtener agente según protocolo
 * 
 * @param url URL del endpoint
 * @returns Agent HTTP o HTTPS según protocolo
 */
export function getAgentForUrl(url) {
  return url.startsWith('https://') ? httpsAgent : httpAgent;
}

/**
 * Configuración de Axios optimizada para alta concurrencia
 * 
 * Uso:
 * ```typescript
 * import { axiosConfig } from '@config/http-client.config';
 * import axios from 'axios';
 * 
 * const response = await axios.post(url, data, {
 *   ...axiosConfig,
 *   timeout: HTTP_TIMEOUTS.CRITICAL,
 * });
 * ```
 */
export const axiosConfig = {
  httpAgent,
  httpsAgent,
  timeout: HTTP_TIMEOUTS.NORMAL,
  // Validar status codes (throw en 4xx/5xx)
  validateStatus: status => status >= 200 && status < 300,
  // Headers por defecto
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  // Máximo tamaño de respuesta (10 MB)
  maxContentLength: 10_000_000,
  maxBodyLength: 10_000_000,
  // No seguir redirects automáticamente
  maxRedirects: 0
};

/**
 * Stats de conexiones activas (para debugging/monitoreo)
 * 
 * Uso:
 * ```typescript
 * import { getConnectionStats } from '@config/http-client.config';
 * 
 * const stats = getConnectionStats();
 * logger.debug({ stats }, 'HTTP Connection Pool Stats');
 * ```
 */
export function getConnectionStats() {
  return {
    http: {
      maxSockets: httpAgent.maxSockets,
      maxFreeSockets: httpAgent.maxFreeSockets,
      // @ts-ignore - Private API pero útil para debugging
      sockets: Object.keys(httpAgent.sockets || {}).length,
      // @ts-ignore
      freeSockets: Object.keys(httpAgent.freeSockets || {}).length
    },
    https: {
      maxSockets: httpsAgent.maxSockets,
      maxFreeSockets: httpsAgent.maxFreeSockets,
      // @ts-ignore
      sockets: Object.keys(httpsAgent.sockets || {}).length,
      // @ts-ignore
      freeSockets: Object.keys(httpsAgent.freeSockets || {}).length
    }
  };
}

/**
 * Cleanup de conexiones al shutdown (graceful shutdown)
 * 
 * Llamar desde main.ts en el hook beforeApplicationShutdown
 */
export function destroyAllConnections() {
  httpAgent.destroy();
  httpsAgent.destroy();
}