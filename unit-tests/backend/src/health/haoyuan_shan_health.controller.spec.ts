import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthAggregatorService } from './health-aggregator.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthAggregatorService: jest.Mocked<HealthAggregatorService>;

  const ALL_UP_SERVICES = {
    'primary-data-service': { status: 'UP' as const, responseTime: 20 },
    'cache-cleanup-service': { status: 'UP' as const, responseTime: 15 },
    'proof-service': { status: 'UP' as const, responseTime: 18 },
    'backup-service': { status: 'UP' as const, responseTime: 12 },
  };

  beforeEach(async () => {
    const mockAggregatorService = {
      checkAll: jest.fn().mockResolvedValue(ALL_UP_SERVICES),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthAggregatorService, useValue: mockAggregatorService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthAggregatorService = module.get(HealthAggregatorService);
  });

  it('returns overall UP when all services report UP', async () => {
    const result = await controller.checkAll();

    expect(result.overall).toBe('UP');
  });

  it('returns overall DEGRADED when at least one service is DOWN', async () => {
    healthAggregatorService.checkAll.mockResolvedValue({
      ...ALL_UP_SERVICES,
      'cache-cleanup-service': { status: 'DOWN', error: 'Connection refused' },
    });

    const result = await controller.checkAll();

    expect(result.overall).toBe('DEGRADED');
  });

  it('includes a services map with all four service names', async () => {
    const result = await controller.checkAll();

    expect(result.services).toHaveProperty('primary-data-service');
    expect(result.services).toHaveProperty('cache-cleanup-service');
    expect(result.services).toHaveProperty('proof-service');
    expect(result.services).toHaveProperty('backup-service');
  });

  it('includes checkedAt as a valid ISO 8601 timestamp', async () => {
    const result = await controller.checkAll();

    expect(result.checkedAt).toBeDefined();
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });

  it('passes through individual service status objects unchanged', async () => {
    const result = await controller.checkAll();

    expect(result.services['primary-data-service']).toEqual(
      ALL_UP_SERVICES['primary-data-service'],
    );
  });
});
