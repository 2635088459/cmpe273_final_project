import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'http';
import { EventEmitter } from 'events';
import { HealthAggregatorService } from './health-aggregator.service';

// ---------------------------------------------------------------------------
// Helper — builds a minimal mock ClientRequest + IncomingMessage pair
// ---------------------------------------------------------------------------
function makeMockRequest() {
  const req = new EventEmitter() as any;
  req.destroy = jest.fn(() => req.emit('close'));
  return req;
}

function makeMockResponse(statusCode: number) {
  const res = new EventEmitter() as any;
  res.statusCode = statusCode;
  res.resume = jest.fn();
  return res;
}

describe('HealthAggregatorService', () => {
  let service: HealthAggregatorService;
  let httpGetSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthAggregatorService],
    }).compile();

    service = module.get<HealthAggregatorService>(HealthAggregatorService);
  });

  afterEach(() => {
    if (httpGetSpy) httpGetSpy.mockRestore();
  });

  // ─── checkService ──────────────────────────────────────────────────────────

  describe('checkService()', () => {
    it('returns UP with a responseTime when the downstream responds with HTTP 200', async () => {
      const mockRes = makeMockResponse(200);
      const mockReq = makeMockRequest();

      httpGetSpy = jest
        .spyOn(http, 'get')
        .mockImplementation((_url: any, _opts: any, callback: any) => {
          callback(mockRes);
          return mockReq;
        });

      const result = await service.checkService('test-svc', 'http://test-svc:3000');

      expect(result.status).toBe('UP');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('returns DOWN when the downstream responds with HTTP 500', async () => {
      const mockRes = makeMockResponse(500);
      const mockReq = makeMockRequest();

      httpGetSpy = jest
        .spyOn(http, 'get')
        .mockImplementation((_url: any, _opts: any, callback: any) => {
          callback(mockRes);
          return mockReq;
        });

      const result = await service.checkService('test-svc', 'http://test-svc:3000');

      expect(result.status).toBe('DOWN');
      expect(result.error).toContain('500');
    });

    it('returns DOWN with error message on network error', async () => {
      const mockReq = makeMockRequest();

      httpGetSpy = jest
        .spyOn(http, 'get')
        .mockImplementation((_url: any, _opts: any, _callback: any) => {
          // Emit error asynchronously after returning the request
          process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')));
          return mockReq;
        });

      const result = await service.checkService('test-svc', 'http://test-svc:3000');

      expect(result.status).toBe('DOWN');
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('returns DOWN with "Request timeout" on socket timeout', async () => {
      const mockReq = makeMockRequest();

      httpGetSpy = jest
        .spyOn(http, 'get')
        .mockImplementation((_url: any, _opts: any, _callback: any) => {
          process.nextTick(() => mockReq.emit('timeout'));
          return mockReq;
        });

      const result = await service.checkService('test-svc', 'http://test-svc:3000');

      expect(result.status).toBe('DOWN');
      expect(result.error).toBe('Request timeout');
    });
  });

  // ─── checkAll ─────────────────────────────────────────────────────────────

  describe('checkAll()', () => {
    it('returns a status entry for all four configured services', async () => {
      jest.spyOn(service, 'checkService').mockResolvedValue({ status: 'UP', responseTime: 10 });

      const result = await service.checkAll();

      expect(Object.keys(result)).toEqual(
        expect.arrayContaining([
          'primary-data-service',
          'cache-cleanup-service',
          'proof-service',
          'backup-service',
        ]),
      );
    });

    it('propagates individual DOWN status into the result map', async () => {
      jest
        .spyOn(service, 'checkService')
        .mockImplementation(async (name: string) => {
          if (name === 'cache-cleanup-service') {
            return { status: 'DOWN', error: 'Connection refused' };
          }
          return { status: 'UP', responseTime: 5 };
        });

      const result = await service.checkAll();

      expect(result['cache-cleanup-service'].status).toBe('DOWN');
      expect(result['primary-data-service'].status).toBe('UP');
    });
  });
});
