const express = require('express');
const request = require('supertest');
const { expressConnectMiddleware } = require('@connectrpc/connect-express');
const connectRoutes = require('../connect-routes').default;

describe('ConnectRPC ElizaService', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(
      expressConnectMiddleware({
        routes: connectRoutes,
      })
    );
  });

  it('✅ responde correctamente al método Say del ElizaService usando JSON', async () => {
    const response = await request(app)
      .post('/eliza.v1.ElizaService/Say')
      .set('Content-Type', 'application/json')
      .send({ sentence: 'Hello, Eliza!' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      sentence: 'You said: "Hello, Eliza!"',
    });
  });
});
