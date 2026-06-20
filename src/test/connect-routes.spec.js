const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppModule } = require('../app.module');
const { RedisService } = require('../utils/redis.service');

describe('ConnectRPC ElizaService (NestJS Integration)', () => {
  let app;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue({
        onModuleInit: jest.fn(), // mock para prevenir process.exit(1)
        get: jest.fn(),
        set: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('✅ responde correctamente al método Say del ElizaService usando JSON a través de NestJS', async () => {
    const response = await request(app.getHttpServer())
      .post('/eliza.v1.ElizaService/Say')
      .set('Content-Type', 'application/json')
      .send({ sentence: 'Hello, NestJS Eliza!' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      sentence: 'You said: "Hello, NestJS Eliza!"',
    });
  });
});
