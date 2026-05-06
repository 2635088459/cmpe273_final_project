import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PrometheusService } from './prometheus.service';

// ---------------------------------------------------------------------------
// Shared fixture — a realistic metrics snapshot
// ---------------------------------------------------------------------------
const MOCK_METRICS = {
  deletion_requests: {
    total: 15,
    by_status: { COMPLETED: 9, FAILED: 1, PENDING: 5 },
  },
  deletion_steps: {
    by_status: { COMPLETED: 45, FAILED: 5 },
  },
  proof_events: {
    total: 66,
    retries: 3,
  },
  collected_at: '2026-05-04T00:00:00.000Z',
};

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: jest.Mocked<MetricsService>;
  let prometheusService: PrometheusService;

  beforeEach(async () => {
    const mockMetricsService = {
      getMetrics: jest.fn().mockResolvedValue(MOCK_METRICS),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: MetricsService, useValue: mockMetricsService },
        PrometheusService, // use the real PrometheusService so registry works
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    metricsService = module.get(MetricsService);
    prometheusService = module.get<PrometheusService>(PrometheusService);
  });

  // ─── GET /metrics ─────────────────────────────────────────────────────────

  describe('GET /metrics', () => {
    it('delegates to MetricsService and returns the result', async () => {
      const result = await controller.getMetrics();
      expect(metricsService.getMetrics).toHaveBeenCalledTimes(1);
      expect(result).toEqual(MOCK_METRICS);
    });

    it('response includes deletion_requests, deletion_steps, and proof_events', async () => {
      const result = await controller.getMetrics();
      expect(result).toHaveProperty('deletion_requests');
      expect(result).toHaveProperty('deletion_steps');
      expect(result).toHaveProperty('proof_events');
    });
  });

  // ─── GET /metrics/prometheus ───────────────────────────────────────────────

  describe('GET /metrics/prometheus', () => {
    it('calls MetricsService.getMetrics then PrometheusService.updateMetrics', async () => {
      const updateSpy = jest
        .spyOn(prometheusService, 'updateMetrics')
        .mockImplementation(() => {});
      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.getPrometheusMetrics(mockRes);

      expect(metricsService.getMetrics).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(MOCK_METRICS);
    });

    it('sets Content-Type to Prometheus text format', async () => {
      jest.spyOn(prometheusService, 'updateMetrics').mockImplementation(() => {});
      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.getPrometheusMetrics(mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        'Content-Type',
        expect.stringContaining('text/plain'),
      );
    });

    it('response body contains Prometheus metric names', async () => {
      jest.spyOn(prometheusService, 'updateMetrics').mockImplementation(() => {});
      let capturedBody = '';
      const mockRes = {
        set: jest.fn(),
        end: jest.fn((body: string) => { capturedBody = body; }),
      } as any;

      await controller.getPrometheusMetrics(mockRes);

      expect(capturedBody).toContain('erasegraph_deletion_requests_total');
    });
  });
});
