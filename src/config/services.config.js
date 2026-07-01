export const services = {
  login: {
    baseUrl: process.env.LOGIN_BASE_URL || '',
    apiKey: process.env.LOGIN_API_KEY || ''
  },
  catalogo: {
    baseUrl: process.env.CATALOGO_BASE_URL || '',
    apiKey: process.env.CATALOGO_API_KEY || ''
  }
};

export const securityValidationMap = {
  login: 'login',
  catalogo: 'login'
};
