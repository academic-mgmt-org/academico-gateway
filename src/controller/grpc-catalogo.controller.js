import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { CatalogoGrpcClientService } from '../services/catalogo-grpc-client.service';

/**
 * Controlador gRPC para el servicio CatalogoService.
 * 
 * Este controlador recibe llamadas gRPC nativas en el puerto 50050
 * y las reenvía al microservicio academico-catalogo vía ConnectRPC.
 * 
 * Flujo:
 *   grpcurl/cliente gRPC → Gateway:50050 → GrpcCatalogoController
 *     → CatalogoGrpcClientService (ConnectRPC HTTP/2) → academico-catalogo:3003
 * 
 * El package y servicio en el .proto son:
 *   package: catalogo.v1
 *   service: CatalogoService
 */
@Controller()
export class GrpcCatalogoController {
  constructor(
    @Inject(CatalogoGrpcClientService) catalogoClient,
    @Inject(Logger) logger,
  ) {
    this.catalogoClient = catalogoClient;
    this.logger = logger;
  }

  /**
   * Listar todas las materias.
   * Corresponde a: rpc ListarMaterias(ListarMateriasRequest) returns (ListarMateriasResponse)
   */
  @GrpcMethod('CatalogoService', 'ListarMaterias')
  async listarMaterias(data) {
    this.logger.log({
      context: 'GrpcCatalogoController',
      event: 'listar_materias',
      carreraId: data?.carreraId || null,
    }, '[gRPC] ListarMaterias llamado');

    try {
      const response = await this.catalogoClient.listarMaterias(data);

      // Convertir la respuesta ConnectRPC a objetos planos para gRPC nativo
      const materias = (response.materias || []).map(m => ({
        id: m.id,
        codigo: m.codigo,
        nombre: m.nombre,
        creditos: m.creditos,
      }));

      this.logger.log({
        context: 'GrpcCatalogoController',
        event: 'listar_materias_success',
        count: materias.length,
      }, `[gRPC] ListarMaterias respondió con ${materias.length} materias`);

      return { materias };
    } catch (error) {
      this.logger.error({
        context: 'GrpcCatalogoController',
        event: 'listar_materias_error',
        error: error.message,
      }, `[gRPC] Error en ListarMaterias: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener una materia por ID.
   * Corresponde a: rpc ObtenerMateria(ObtenerMateriaRequest) returns (ObtenerMateriaResponse)
   */
  @GrpcMethod('CatalogoService', 'ObtenerMateria')
  async obtenerMateria(data) {
    this.logger.log({
      context: 'GrpcCatalogoController',
      event: 'obtener_materia',
      id: data?.id,
    }, `[gRPC] ObtenerMateria llamado con id=${data?.id}`);

    try {
      const response = await this.catalogoClient.obtenerMateria(data);

      const materia = response.materia ? {
        id: response.materia.id,
        codigo: response.materia.codigo,
        nombre: response.materia.nombre,
        creditos: response.materia.creditos,
      } : null;

      this.logger.log({
        context: 'GrpcCatalogoController',
        event: 'obtener_materia_success',
        id: data?.id,
        found: !!materia,
      }, `[gRPC] ObtenerMateria respondió${materia ? ': ' + materia.nombre : ': no encontrada'}`);

      return { materia };
    } catch (error) {
      this.logger.error({
        context: 'GrpcCatalogoController',
        event: 'obtener_materia_error',
        id: data?.id,
        error: error.message,
      }, `[gRPC] Error en ObtenerMateria: ${error.message}`);
      throw error;
    }
  }
}
