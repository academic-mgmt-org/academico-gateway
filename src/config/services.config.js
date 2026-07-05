export const services = {
  login: {
    baseUrl: process.env.LOGIN_BASE_URL || '',
    apiKey: process.env.LOGIN_API_KEY || ''
  },
  notificaciones: {
    baseUrl: process.env.NOTIFICACIONES_BASE_URL || '',
    apiKey: process.env.NOTIFICACIONES_API_KEY || ''
  }
};

export const securityValidationMap = {
  login: 'login'
};
