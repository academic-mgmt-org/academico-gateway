import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { CatalogoService } from '../gen/proto/catalogo/v1/catalogo_pb.js';
import { services } from '../config/services.config';

/**
 * Cliente gRPC/ConnectRPC para el microservicio academico-catalogo.
 * 
 * Usa el protocolo Connect (HTTP/2) para comunicarse con el microservicio,
 * que a su vez usa fastifyConnectPlugin.
 * 
 * Este servicio es inyectado en el GrpcCatalogoController para que el
 * gateway actúe como intermediario entre clientes gRPC y el microservicio.
 */
@Injectable()
export class CatalogoGrpcClientService {
  /** @type {import('@connectrpc/connect').Client<typeof CatalogoService>} */
  client = null;

  constructor(@Inject(Logger) logger) {
    this.logger = logger;
  }

  onModuleInit() {
    const catalogoConfig = services.catalogo;

    if (!catalogoConfig || !catalogoConfig.baseUrl) {
      this.logger.warn({
        context: 'CatalogoGrpcClientService',
        event: 'client_not_configured',
      }, '⚠️ CATALOGO_BASE_URL no configurada, cliente gRPC no inicializado');
      return;
    }

    const transport = createConnectTransport({
      baseUrl: catalogoConfig.baseUrl,
      httpVersion: '2',
      interceptors: [
        (next) => async (req) => {
          req.header.set('x-api-key', catalogoConfig.apiKey);
          return await next(req);
        },
      ],
    });

    this.client = createClient(CatalogoService, transport);

    this.logger.log({
      context: 'CatalogoGrpcClientService',
      event: 'client_initialized',
      baseUrl: catalogoConfig.baseUrl,
    }, `✅ Cliente ConnectRPC de Catálogo inicializado -> ${catalogoConfig.baseUrl}`);
  }

  /**
   * Listar materias, opcionalmente filtradas por carrera, malla y nivel.
   * @param {{ carreraId?: string, carreraCodigo?: string, nivelPeriodo?: number, mallaId?: string, soloMallaVigente?: boolean }} data
   * @returns {Promise<{ materias: Array<{ id: string, codigo: string, nombre: string, creditos: number, carreraId?: string, carreraCodigo?: string, carreraNombre?: string, nivelPeriodo?: number, mallaId?: string, mallaCodigo?: string, mallaVersion?: string, orden?: number, tipo?: string }> }>}
   */
  async listarMaterias(data = {}) {
    if (!this.client) {
      throw new Error('Cliente de Catálogo no inicializado');
    }

    this.logger.debug({
      context: 'CatalogoGrpcClientService',
      event: 'listar_materias_request',
      carreraId: data.carreraId || null,
      carreraCodigo: data.carreraCodigo || null,
      nivelPeriodo: data.nivelPeriodo || null,
      mallaId: data.mallaId || null,
      soloMallaVigente: data.soloMallaVigente || false,
    }, '[Catálogo] Solicitando ListarMaterias al microservicio');

    const response = await this.client.listarMaterias({
      carreraId: data.carreraId || '',
      carreraCodigo: data.carreraCodigo || '',
      nivelPeriodo: data.nivelPeriodo || 0,
      mallaId: data.mallaId || '',
      soloMallaVigente: data.soloMallaVigente || false,
    });

    this.logger.debug({
      context: 'CatalogoGrpcClientService',
      event: 'listar_materias_response',
      count: response.materias?.length || 0,
    }, `[Catálogo] Respuesta recibida: ${response.materias?.length || 0} materias`);

    return response;
  }

  /**
   * Obtener una materia por su ID.
   * @param {{ id: string }} data
   * @returns {Promise<{ materia: { id: string, codigo: string, nombre: string, creditos: number, carreraId?: string, carreraCodigo?: string, carreraNombre?: string, nivelPeriodo?: number, mallaId?: string, mallaCodigo?: string, mallaVersion?: string, orden?: number, tipo?: string } }>}
   */
  async obtenerMateria(data) {
    if (!this.client) {
      throw new Error('Cliente de Catálogo no inicializado');
    }

    this.logger.debug({
      context: 'CatalogoGrpcClientService',
      event: 'obtener_materia_request',
      id: data.id,
    }, `[Catálogo] Solicitando ObtenerMateria id=${data.id} al microservicio`);

    const response = await this.client.obtenerMateria({ id: data.id });

    return response;
  }
}
