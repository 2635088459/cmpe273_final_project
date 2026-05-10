import { QueryFailedError } from 'typeorm';
import { EventTypes } from '../types/events';
import { genesisHashForRequest } from '../proof/proof-hash.util';
import { ProofConsumerService } from './proof-consumer.service';

describe('ProofConsumerService', () => {
  let service: ProofConsumerService;
  let configService: { get: jest.Mock };
  let proofEventRepository: any;
  let saveMock: jest.Mock;

  beforeEach(() => {
    saveMock = jest.fn().mockResolvedValue(undefined);

    proofEventRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      save: saveMock,
    };

    configService = { get: jest.fn().mockReturnValue('amqp://test') };

    service = new ProofConsumerService(configService as any, proofEventRepository as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('stores succeeded proof event with computed previous hash', async () => {
    const event = {
      request_id: 'req-1',
      step_name: 'cache',
      service_name: 'cache_cleanup',
      trace_id: 'trace-1',
      timestamp: '2026-05-09T17:00:00.000Z',
      metadata: { deleted_records: 3 },
    };

    await (service as any).storeSucceededEvent(event);

    expect(saveMock).toHaveBeenCalledTimes(1);
    const saved = saveMock.mock.calls[0][0];
    expect(saved.request_id).toBe('req-1');
    expect(saved.event_type).toBe(EventTypes.DELETION_STEP_SUCCEEDED);
    expect(saved.previous_hash).toBe(genesisHashForRequest('req-1'));
    expect(saved.event_hash).toBeDefined();
    expect(saved.payload.step_name).toBe('cache');
  });

  it('stores failed proof event and keeps error fields in payload', async () => {
    const event = {
      request_id: 'req-2',
      step_name: 'backup',
      service_name: 'backup',
      trace_id: 'trace-2',
      timestamp: '2026-05-09T17:05:00.000Z',
      error_message: 'boom',
      error_code: 'ERR_X',
      retry_count: 2,
      metadata: { sample: true },
    };

    await (service as any).storeFailedEvent(event);

    const saved = saveMock.mock.calls[0][0];
    expect(saved.event_type).toBe(EventTypes.DELETION_STEP_FAILED);
    expect(saved.payload.error_message).toBe('boom');
    expect(saved.payload.error_code).toBe('ERR_X');
    expect(saved.payload.retry_count).toBe(2);
  });

  it('ignores duplicate-key errors during storeProofEvent', async () => {
    saveMock.mockRejectedValueOnce(new QueryFailedError('insert', [], { code: '23505' } as any));

    await expect(
      (service as any).storeProofEvent({
        request_id: 'req-3',
        service_name: 'cache_cleanup',
        event_type: EventTypes.DELETION_STEP_SUCCEEDED,
        dedupe_key: 'd1',
        payload: { timestamp: '2026-05-09T17:10:00.000Z' },
      }),
    ).resolves.toBeUndefined();
  });
});
