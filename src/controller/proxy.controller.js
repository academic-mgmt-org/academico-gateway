import { Controller, All, Req, Res, Inject } from '@nestjs/common';
import { ProxyService } from '../services/proxy.service';

/**
 * ProxyController - Controlador catch-all para proxy de microservicios
 * 
 * IMPORTANTE: Este controlador usa @Controller() sin ruta específica
 * y @All(':microservice/*') para capturar todas las rutas de microservicios.
 * 
 * Las rutas administrativas /api/* son manejadas por HealthController
 * y NO deben llegar aquí.
 */
@Controller()
export class ProxyController {
  constructor(@Inject(ProxyService) proxyService) {
    this.proxyService = proxyService;
  }

  /**
   * Handler principal para todas las rutas de microservicios
   * Formato esperado: /:microservice/*
   * Ejemplos: /estudiante/api/v1/perfil, /docente/api/v1/materias
   */
  @All(':microservice/*')
  async handleMicroserviceRequest(@Req()
  req, @Res()
  res) {
    return this.proxyService.processRequest(req, res);
  }

  /**
   * Handler para Socket.IO (ruta especial)
   * Formato: /socket.io/*
   */
  @All('socket.io/*')
  async handleSocketIO(@Req()
  req, @Res()
  res) {
    return this.proxyService.processRequest(req, res);
  }
}