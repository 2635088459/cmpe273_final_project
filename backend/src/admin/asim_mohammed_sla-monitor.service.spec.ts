import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SlaMonitorService } from './sla-monitor.service';
import { DeletionRequest, DeletionRequestStatus } from '../database/entities/deletion-request.entity';
import { ProofEvent } from '../database/entities/proof-event.entity';
import { EventTypes } from '../events/types';

describe('SlaMonitorService', () => {
  let service: SlaMonitorService;
  let deletionRepo: {
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
    find: jest.Mock;
  };
  let proofRepo: { createQueryBuilder: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    deletionRepo = {
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      find: jest.fn(),
    };
    proofRepo = {
      createQueryBuilder: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaMonitorService,
        { provide: getRepositoryToken(DeletionRequest), useValue: deletionRepo },
        { provide: getRepositoryToken(ProofEvent), useValue: proofRepo },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('1') },
        },
      ],
    }).compile();

    service = module.get(SlaMonitorService);

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    deletionRepo.createQueryBuilder.mockReturnValue(qb);

    const pq = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    proofRepo.createQueryBuilder.mockReturnValue(pq);
  });

  it('does nothing when no in-flight requests exceed the SLA window', async () => {
    const qb = deletionRepo.createQueryBuilder();
    qb.getMany.mockResolvedValue([]);

    await service.checkSlaViolations();

    expect(deletionRepo.update).not.toHaveBeenCalled();
  });

  it('flags stuck in-progress requests past threshold and updates DB + proof', async () => {
    const oldReq = {
      id: 'rid-1',
      subject_id: 'sub-1',
      status: DeletionRequestStatus.PENDING,
      created_at: new Date(Date.now() - 10 * 60_000),
    } as DeletionRequest;

    const qb = deletionRepo.createQueryBuilder();
    qb.getMany.mockResolvedValue([oldReq]);
    deletionRepo.update.mockResolvedValue({ affected: 1 });
    proofRepo.save.mockResolvedValue({});

    const count = await service.checkSlaViolations();

    expect(count).toBe(1);
    expect(deletionRepo.update).toHaveBeenCalled();
    expect(proofRepo.save).toHaveBeenCalled();
    const saved = proofRepo.save.mock.calls[0][0];
    expect(saved.event_type).toBe(EventTypes.SLA_VIOLATED);
  });

  it('listViolations returns SLA_VIOLATED rows with expected fields', async () => {
    const t0 = new Date('2026-05-07T10:00:00.000Z');
    deletionRepo.find.mockResolvedValue([
      {
        id: 'a',
        subject_id: 's1',
        created_at: t0,
        status: DeletionRequestStatus.SLA_VIOLATED,
      },
    ]);

    const rows = await service.listViolations();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      request_id: 'a',
      subject_id: 's1',
      stuck_since: t0.toISOString(),
    });
    expect(typeof rows[0].duration_minutes).toBe('number');
  });
});
