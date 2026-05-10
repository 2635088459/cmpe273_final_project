import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DlqReplayService } from './dlq-replay.service';
import { SlaMonitorService, SlaViolationItem } from './sla-monitor.service';

const mockCircuitBreakerService = () => ({
  getCircuitStates: jest.fn().mockResolvedValue([])
});

const mockDlqReplayService = () => ({
  replay: jest.fn()
});

const mockSlaMonitorService = () => ({
  getSlaViolations: jest.fn(),
  checkSlaViolations: jest.fn()
});

describe('AdminController — SLA Violations', () => {
  let controller: AdminController;
  let slaMonitorService: ReturnType<typeof mockSlaMonitorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: CircuitBreakerService, useFactory: mockCircuitBreakerService },
        { provide: DlqReplayService, useFactory: mockDlqReplayService },
        { provide: SlaMonitorService, useFactory: mockSlaMonitorService }
      ]
    }).compile();

    controller = module.get<AdminController>(AdminController);
    slaMonitorService = module.get(SlaMonitorService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /admin/sla-violations', () => {
    it('returns only requests with status SLA_VIOLATED', async () => {
      const violations: SlaViolationItem[] = [
        {
          request_id: 'req-sla-1',
          subject_id: 'user-stuck',
          stuck_since: new Date('2026-05-09T10:00:00Z'),
          duration_minutes: 15
        }
      ];

      slaMonitorService.getSlaViolations.mockResolvedValue(violations);

      const result = await controller.getSlaViolations();

      expect(slaMonitorService.getSlaViolations).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].request_id).toBe('req-sla-1');
    });

    it('returns an empty array when no violations exist', async () => {
      slaMonitorService.getSlaViolations.mockResolvedValue([]);

      const result = await controller.getSlaViolations();

      expect(result).toEqual([]);
    });

    it('response includes request_id, subject_id, stuck_since, and duration_minutes fields', async () => {
      const stuckSince = new Date('2026-05-09T09:00:00Z');
      const violations: SlaViolationItem[] = [
        {
          request_id: 'req-sla-2',
          subject_id: 'user-check',
          stuck_since: stuckSince,
          duration_minutes: 42
        }
      ];

      slaMonitorService.getSlaViolations.mockResolvedValue(violations);

      const result = await controller.getSlaViolations();

      expect(result[0]).toHaveProperty('request_id', 'req-sla-2');
      expect(result[0]).toHaveProperty('subject_id', 'user-check');
      expect(result[0]).toHaveProperty('stuck_since', stuckSince);
      expect(result[0]).toHaveProperty('duration_minutes', 42);
    });

    it('delegates entirely to SlaMonitorService.getSlaViolations()', async () => {
      const mockResult: SlaViolationItem[] = [
        {
          request_id: 'req-delegate',
          subject_id: 'user-delegate',
          stuck_since: new Date(),
          duration_minutes: 8
        }
      ];
      slaMonitorService.getSlaViolations.mockResolvedValue(mockResult);

      const result = await controller.getSlaViolations();

      expect(slaMonitorService.getSlaViolations).toHaveBeenCalled();
      expect(result).toBe(mockResult);
    });
  });
});
