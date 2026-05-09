import { AdminController } from './admin.controller';

describe('AdminController', () => {
  let controller: AdminController;
  let circuitBreakerService: { getCircuitStates: jest.Mock };
  let dlqReplayService: { replay: jest.Mock };
  let slaMonitorService: { getSlaViolations: jest.Mock };

  beforeEach(() => {
    circuitBreakerService = { getCircuitStates: jest.fn() };
    dlqReplayService = { replay: jest.fn() };
    slaMonitorService = { getSlaViolations: jest.fn() };

    controller = new AdminController(
      circuitBreakerService as any,
      dlqReplayService as any,
      slaMonitorService as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('getCircuitStates delegates to circuit breaker service', async () => {
    const expected = [{ service_name: 'cache_cleanup', state: 'OPEN', failure_count: 3 }];
    circuitBreakerService.getCircuitStates.mockResolvedValueOnce(expected);

    await expect(controller.getCircuitStates()).resolves.toEqual(expected);
    expect(circuitBreakerService.getCircuitStates).toHaveBeenCalledTimes(1);
  });

  it('replayDlq delegates to replay service', async () => {
    const expected = { queue: 'erasegraph.dlq.cache-cleanup', replayed: 2 };
    dlqReplayService.replay.mockResolvedValueOnce(expected);

    await expect(controller.replayDlq('cache-cleanup')).resolves.toEqual(expected);
    expect(dlqReplayService.replay).toHaveBeenCalledWith('cache-cleanup');
  });

  it('getSlaViolations delegates to SLA monitor service', async () => {
    const expected = [{ request_id: 'r1', age_seconds: 400 }];
    slaMonitorService.getSlaViolations.mockResolvedValueOnce(expected);

    await expect(controller.getSlaViolations()).resolves.toEqual(expected);
    expect(slaMonitorService.getSlaViolations).toHaveBeenCalledTimes(1);
  });
});
