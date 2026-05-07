import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DlqReplayService } from './dlq-replay.service';
import { SlaMonitorService } from './sla-monitor.service';

describe('AdminController SLA', () => {
  let controller: AdminController;
  let sla: { listViolations: jest.Mock };

  beforeEach(async () => {
    sla = { listViolations: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: CircuitBreakerService, useValue: { getCircuitStates: jest.fn().mockResolvedValue([]) } },
        { provide: DlqReplayService, useValue: { replay: jest.fn() } },
        { provide: SlaMonitorService, useValue: sla },
      ],
    }).compile();

    controller = module.get(AdminController);
  });

  it('GET /admin/sla-violations delegates to SlaMonitorService', async () => {
    sla.listViolations.mockResolvedValue([
      {
        request_id: 'r1',
        subject_id: 's1',
        stuck_since: '2026-05-07T10:00:00.000Z',
        duration_minutes: 9,
      },
    ]);

    const rows = await controller.getSlaViolations();

    expect(sla.listViolations).toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      request_id: 'r1',
      subject_id: 's1',
      stuck_since: expect.any(String),
      duration_minutes: expect.any(Number),
    });
  });
});
