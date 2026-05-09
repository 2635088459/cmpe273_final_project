import { QueryFailedError } from 'typeorm';
import { ProofEvent } from '../database/entities';
import { computeProofEventHash, genesisHashForRequest } from './proof-hash.util';
import { ProofChainService } from './proof-chain.service';

describe('ProofChainService', () => {
  let service: ProofChainService;
  let saveMock: jest.Mock;
  let getOneMock: jest.Mock;
  let queryMock: jest.Mock;
  let manager: any;
  let repository: any;

  beforeEach(() => {
    saveMock = jest.fn().mockResolvedValue(undefined);
    getOneMock = jest.fn().mockResolvedValue(null);
    queryMock = jest.fn().mockResolvedValue(undefined);

    manager = {
      query: queryMock,
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getOne: getOneMock,
        }),
        create: jest.fn((v) => v),
        save: saveMock,
      }),
    };

    repository = {
      manager: {
        transaction: jest.fn(async (cb: (tx: any) => Promise<void>) => cb(manager)),
      },
    };

    service = new ProofChainService(repository as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('appendEvent stores event with genesis previous_hash when chain is empty', async () => {
    const timestamp = '2026-05-09T10:00:00.000Z';
    const input = {
      request_id: 'req-1',
      service_name: 'cache_cleanup',
      event_type: 'DeletionStepSucceeded',
      dedupe_key: 'd1',
      payload: { step_name: 'cache', timestamp },
    };

    await service.appendEvent(input);

    expect(queryMock).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      ['req-1', 'proof_chain'],
    );

    const savedEvent = saveMock.mock.calls[0][0];
    const expectedPrev = genesisHashForRequest('req-1');
    const expectedHash = computeProofEventHash(
      expectedPrev,
      'req-1',
      'cache_cleanup',
      'DeletionStepSucceeded',
      { step_name: 'cache', timestamp },
      timestamp,
    );

    expect(savedEvent.previous_hash).toBe(expectedPrev);
    expect(savedEvent.event_hash).toBe(expectedHash);
  });

  it('appendEvent ignores duplicate-key database errors', async () => {
    repository.manager.transaction = jest
      .fn()
      .mockRejectedValueOnce(new QueryFailedError('INSERT INTO proof_events ...', [], { code: '23505' } as any));

    await expect(
      service.appendEvent({
        request_id: 'req-2',
        service_name: 'backup',
        event_type: 'DeletionStepSucceeded',
        dedupe_key: 'dup-1',
        payload: { timestamp: '2026-05-09T10:00:00.000Z' },
      }),
    ).resolves.toBeUndefined();
  });

  it('appendEvent rethrows non-duplicate database errors', async () => {
    repository.manager.transaction = jest
      .fn()
      .mockRejectedValueOnce(new QueryFailedError('INSERT INTO proof_events ...', [], { code: '22001' } as any));

    await expect(
      service.appendEvent({
        request_id: 'req-3',
        service_name: 'backup',
        event_type: 'DeletionStepFailed',
        dedupe_key: 'x',
        payload: { timestamp: '2026-05-09T10:00:00.000Z' },
      }),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });
});
