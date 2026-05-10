import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
import { DeletionRequest } from '../database/entities/deletion-request.entity';
import { DeletionStep } from '../database/entities/deletion-step.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';

// ---------------------------------------------------------------------------
// Helpers — build a chainable query builder mock
// ---------------------------------------------------------------------------
const makeQueryBuilder = (rawRows: any[], count = 0) => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
    getCount: jest.fn().mockResolvedValue(count),
  };
  return qb;
};

describe('MetricsService', () => {
  let service: MetricsService;
  let deletionRequestRepo: any;
  let deletionStepRepo: any;
  let proofEventRepo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: getRepositoryToken(DeletionRequest),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(DeletionStep),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(ProofEvent),
          useValue: { count: jest.fn(), createQueryBuilder: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    deletionRequestRepo = module.get(getRepositoryToken(DeletionRequest));
    deletionStepRepo = module.get(getRepositoryToken(DeletionStep));
    proofEventRepo = module.get(getRepositoryToken(ProofEvent));
  });

  it('returns the correct top-level shape', async () => {
    deletionRequestRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([
        { status: 'COMPLETED', count: '9' },
        { status: 'FAILED', count: '1' },
      ]),
    );
    deletionStepRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([{ status: 'COMPLETED', count: '45' }]),
    );
    proofEventRepo.count.mockResolvedValue(66);
    proofEventRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([], 3));

    const result = await service.getMetrics();

    expect(result).toHaveProperty('deletion_requests');
    expect(result).toHaveProperty('deletion_steps');
    expect(result).toHaveProperty('proof_events');
    expect(result).toHaveProperty('collected_at');
  });

  it('correctly aggregates total from by_status rows', async () => {
    deletionRequestRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([
        { status: 'COMPLETED', count: '8' },
        { status: 'FAILED', count: '2' },
        { status: 'PENDING', count: '5' },
      ]),
    );
    deletionStepRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([{ status: 'COMPLETED', count: '40' }]),
    );
    proofEventRepo.count.mockResolvedValue(100);
    proofEventRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([], 0));

    const result = await service.getMetrics();

    expect(result.deletion_requests.total).toBe(15);
    expect(result.deletion_requests.by_status['COMPLETED']).toBe(8);
    expect(result.deletion_requests.by_status['FAILED']).toBe(2);
    expect(result.deletion_requests.by_status['PENDING']).toBe(5);
  });

  it('returns zero totals when the database is empty', async () => {
    deletionRequestRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([]),
    );
    deletionStepRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));
    proofEventRepo.count.mockResolvedValue(0);
    proofEventRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([], 0));

    const result = await service.getMetrics();

    expect(result.deletion_requests.total).toBe(0);
    expect(result.proof_events.total).toBe(0);
    expect(result.proof_events.retries).toBe(0);
  });

  it('collected_at is a valid ISO 8601 timestamp', async () => {
    deletionRequestRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([]),
    );
    deletionStepRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));
    proofEventRepo.count.mockResolvedValue(0);
    proofEventRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([], 0));

    const result = await service.getMetrics();

    expect(() => new Date(result.collected_at)).not.toThrow();
    expect(new Date(result.collected_at).toISOString()).toBe(result.collected_at);
  });
});
