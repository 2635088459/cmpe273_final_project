import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import { EventConsumerService } from './event-consumer.service';
import { ProcessedEvent } from '../database/entities';
import { DeletionRequestService } from '../deletion-request/deletion-request.service';
import { ProofChainService } from '../proof/proof-chain.service';
import { EventTypes } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a QueryFailedError whose driverError.code matches a Postgres error. */
function makeQueryFailedError(pgCode: string): QueryFailedError {
  const err = Object.create(QueryFailedError.prototype) as QueryFailedError;
  (err as any).driverError = { code: pgCode };
  return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventConsumerService — idempotency', () => {
  let service: EventConsumerService;
  let mockProcessedRepo: { insert: jest.Mock };
  let mockProofChainService: { appendEvent: jest.Mock };

  beforeAll(() => {
    // Prevent onModuleInit from attempting a RabbitMQ connection during compile.
    jest
      .spyOn(EventConsumerService.prototype, 'onModuleInit')
      .mockResolvedValue(undefined as any);
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(async () => {
    mockProcessedRepo = { insert: jest.fn().mockResolvedValue({}) };
    mockProofChainService = { appendEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventConsumerService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
        { provide: getRepositoryToken(ProcessedEvent), useValue: mockProcessedRepo },
        {
          provide: DeletionRequestService,
          useValue: { updateStepStatus: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ProofChainService, useValue: mockProofChainService },
      ],
    }).compile();

    service = module.get<EventConsumerService>(EventConsumerService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // Test 1: markProcessedEvent returns true when the event has not been seen
  // -------------------------------------------------------------------------
  it('returns true when the event_id is new (first occurrence)', async () => {
    mockProcessedRepo.insert.mockResolvedValue({});

    const result = await service.markProcessedEvent('evt-111', 'req-aaa', 'cache_cleanup');

    expect(result).toBe(true);
    expect(mockProcessedRepo.insert).toHaveBeenCalledWith({
      event_id: 'evt-111',
      request_id: 'req-aaa',
      service_name: 'cache_cleanup',
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: markProcessedEvent returns false on duplicate (Postgres code 23505)
  // The unique constraint on processed_events(event_id, service_name) prevents
  // double-processing: the second insert raises a 23505 violation and the
  // service signals "already processed" by returning false.
  // -------------------------------------------------------------------------
  it('returns false when the same event_id arrives a second time (duplicate constraint 23505)', async () => {
    mockProcessedRepo.insert.mockRejectedValue(makeQueryFailedError('23505'));

    const result = await service.markProcessedEvent('evt-111', 'req-aaa', 'cache_cleanup');

    expect(result).toBe(false);
    // The insert was attempted exactly once, not skipped entirely
    expect(mockProcessedRepo.insert).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 3: handleDuplicateEventIgnored records a DUPLICATE_EVENT_IGNORED proof
  // When cache-cleanup-service detects a duplicate (markProcessedEvent → false),
  // it publishes a DUPLICATE_EVENT_IGNORED event. EventConsumerService saves a
  // proof event with that event_type so the audit trail is complete.
  // -------------------------------------------------------------------------
  it('saves a proof event with event_type DUPLICATE_EVENT_IGNORED when a duplicate is detected', async () => {
    const duplicateEvent = {
      eventType: EventTypes.DUPLICATE_EVENT_IGNORED,
      request_id: 'req-bbb',
      service_name: 'cache_cleanup',
      step_name: 'cache-cleanup',
      duplicate_event_id: 'evt-dup-999',
      trace_id: 'trace-xyz',
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    await (service as any).handleDuplicateEventIgnored(duplicateEvent);

    expect(mockProofChainService.appendEvent).toHaveBeenCalledTimes(1);
    const saved = mockProofChainService.appendEvent.mock.calls[0][0];
    expect(saved.event_type).toBe(EventTypes.DUPLICATE_EVENT_IGNORED);
    expect(saved.request_id).toBe('req-bbb');
    expect(saved.service_name).toBe('cache_cleanup');
    expect(saved.payload).toMatchObject({
      duplicate_event_id: 'evt-dup-999',
      step_name: 'cache-cleanup',
    });
  });
});
