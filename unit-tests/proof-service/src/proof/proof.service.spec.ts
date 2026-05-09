import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProofEvent } from '../entities';
import { ProofService } from './proof.service';

describe('ProofService', () => {
  let service: ProofService;
  let proofEventRepository: { find: jest.Mock };

  beforeEach(async () => {
    proofEventRepository = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofService,
        { provide: getRepositoryToken(ProofEvent), useValue: proofEventRepository },
      ],
    }).compile();

    service = module.get<ProofService>(ProofService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns proof response with events and summary when events exist', async () => {
    const createdAt = new Date('2026-05-09T15:00:00.000Z');
    proofEventRepository.find.mockResolvedValueOnce([
      {
        id: 'evt-1',
        request_id: 'req-1',
        service_name: 'cache_cleanup',
        event_type: 'DeletionStepSucceeded',
        payload: { step_name: 'cache' },
        created_at: createdAt,
      },
      {
        id: 'evt-2',
        request_id: 'req-1',
        service_name: 'backup',
        event_type: 'DeletionStepSucceeded',
        payload: { step_name: 'backup' },
        created_at: createdAt,
      },
    ]);

    const result = await service.getProofByRequestId('req-1');

    expect(result.request_id).toBe('req-1');
    expect(result.events).toHaveLength(2);
    expect(result.verification_summary.total_events).toBe(2);
    expect(result.verification_summary.services_involved).toEqual(
      expect.arrayContaining(['cache_cleanup', 'backup']),
    );

    expect(proofEventRepository.find).toHaveBeenCalledWith({
      where: { request_id: 'req-1' },
      order: { created_at: 'ASC' },
    });
  });

  it('throws NotFoundException when no proof events found', async () => {
    proofEventRepository.find.mockResolvedValueOnce([]);

    await expect(service.getProofByRequestId('req-missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
