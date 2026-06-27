export const services = {
  login: {
    baseUrl: process.env.LOGIN_BASE_URL || '',
    apiKey: process.env.LOGIN_API_KEY || ''
  },
  usuarios: {
    baseUrl: process.env.USUARIOS_BASE_URL || '',
    apiKey: process.env.USUARIOS_API_KEY || ''
  },
  calificaciones: {
    baseUrl: process.env.CALIFICACIONES_BASE_URL || '',
    apiKey: process.env.CALIFICACIONES_API_KEY || ''
  },
  catalogo: {
    baseUrl: process.env.CATALOGO_BASE_URL || '',
    apiKey: process.env.CATALOGO_API_KEY || ''
  },
  matriculas: {
    baseUrl: process.env.MATRICULAS_BASE_URL || '',
    apiKey: process.env.MATRICULAS_API_KEY || ''
  },
  solicitudes: {
    baseUrl: process.env.SOLICITUDES_BASE_URL || '',
    apiKey: process.env.SOLICITUDES_API_KEY || ''
  }
};
export const securityValidationMap = {
  login: 'login',
  usuarios: 'login',
  calificaciones: 'login',
  catalogo: 'login',
  matriculas: 'login',
  solicitudes: 'login'
};
