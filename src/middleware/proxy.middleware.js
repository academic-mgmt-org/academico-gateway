import { Injectable, Logger } from '@nestjs/common';
@Injectable()
export class ProxyMiddleware {
  logger = new Logger(ProxyMiddleware.name);
  use(req, res, next) {
    this.logger.debug(`[Middleware] Procesando solicitud para ${req.path}`);
    next();
  }
}