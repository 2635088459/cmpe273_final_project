import { QueryFailedError } from 'typeorm';
import { EventConsumerService } from './event-consumer.service';

describe('EventConsumerService', () => {
  let service: EventConsumerService;
  let processedEventRepository: { insert: jest.Mock };

  beforeEach(() => {
    processedEventRepository = { insert: jest.fn().mockResolvedValue({}) };
    service = new EventConsumerService(
      { get: jest.fn().mockReturnValue('amqp://test') } as any,
      processedEventRepository as any,
      { updateStepStatus: jest.fn() } as any,
      { appendEvent: jest.fn() } as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('markProcessedEvent returns true when insert succeeds', async () => {
    await expect(service.markProcessedEvent('e1', 'r1', 'cache_cleanup')).resolves.toBe(true);
  });

  it('markProcessedEvent returns false for duplicate key error', async () => {
    processedEventRepository.insert.mockRejectedValueOnce(
      new QueryFailedError('insert', [], { code: '23505' } as any),
    );

    await expect(service.markProcessedEvent('e1', 'r1', 'cache_cleanup')).resolves.toBe(false);
  });

  it('markProcessedEvent rethrows non-duplicate database error', async () => {
    processedEventRepository.insert.mockRejectedValueOnce(
      new QueryFailedError('insert', [], { code: '22001' } as any),
    );

    await expect(service.markProcessedEvent('e1', 'r1', 'cache_cleanup')).rejects.toBeInstanceOf(QueryFailedError);
  });
});
