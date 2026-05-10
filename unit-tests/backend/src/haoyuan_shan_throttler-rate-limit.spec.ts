import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as request from 'supertest';

// ---------------------------------------------------------------------------
// Minimal controller used only for throttler tests
// ---------------------------------------------------------------------------
@Controller('test-ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Rate Limiting tests (CODE-INFRA-003 Part A)
//
// Uses ThrottlerModule with a tight limit of 3 req / 60 s so the 429 triggers
// quickly without waiting for the production 60-request limit.
// ---------------------------------------------------------------------------
describe('Rate Limiting — ThrottlerGuard (CODE-INFRA-003)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }]),
      ],
      controllers: [PingController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows requests within the rate limit (first 3 succeed with 200)', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/test-ping').expect(200);
    }
  });

  it('returns 429 Too Many Requests when the limit is exceeded', async () => {
    // The limit was already consumed in the previous test (same app instance).
    // The 4th request must be throttled.
    const response = await request(app.getHttpServer()).get('/test-ping');
    expect(response.status).toBe(429);
  });

  it('429 response body contains a ThrottlerException message', async () => {
    const response = await request(app.getHttpServer()).get('/test-ping');
    expect(response.status).toBe(429);
    // NestJS ThrottlerException default message
    expect(response.body.message).toMatch(/too many requests/i);
  });
});
