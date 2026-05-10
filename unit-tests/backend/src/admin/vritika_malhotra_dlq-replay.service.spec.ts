// jest.mock is hoisted by ts-jest before any imports run.
jest.mock('amqplib');

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import * as amqp from 'amqplib';
import { DlqReplayService } from './dlq-replay.service';

// ---------------------------------------------------------------------------
// Build a minimal amqplib mock that satisfies DlqReplayService.replay()
// ---------------------------------------------------------------------------

function buildMockChannel(messageCount: number) {
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    content: Buffer.from(JSON.stringify({ event_id: `evt-${i}`, request_id: `req-${i}` })),
    properties: {
      headers: { 'event-id': `evt-${i}` },
      contentType: 'application/json',
      contentEncoding: undefined,
      correlationId: undefined,
      messageId: undefined,
    },
  }));

  let callIndex = 0;
  return {
    assertExchange: jest.fn().mockResolvedValue({}),
    // First assertQueue call returns { messageCount } so replay knows how many msgs to pull.
    assertQueue: jest.fn().mockResolvedValue({ messageCount }),
    get: jest.fn().mockImplementation(() => {
      return callIndex < messages.length
        ? Promise.resolve(messages[callIndex++])
        : Promise.resolve(false);
    }),
    publish: jest.fn(),
    ack: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockConnection(channel: ReturnType<typeof buildMockChannel>) {
  return {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DlqReplayService', () => {
  let service: DlqReplayService;
  let mockChannel: ReturnType<typeof buildMockChannel>;
  let mockConnection: ReturnType<typeof buildMockConnection>;
  const mockedAmqp = amqp as jest.Mocked<typeof amqp>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockChannel = buildMockChannel(2);
    mockConnection = buildMockConnection(mockChannel);
    mockedAmqp.connect.mockResolvedValue(mockConnection as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqReplayService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(null) },
        },
      ],
    }).compile();

    service = module.get<DlqReplayService>(DlqReplayService);
  });

  // -------------------------------------------------------------------------
  // Test 1: replay re-publishes messages from DLQ back to the main exchange
  // -------------------------------------------------------------------------
  it('re-publishes all DLQ messages back to the main exchange and returns the count', async () => {
    const result = await service.replay('cache-cleanup');

    // Correct target queue and replayed count
    expect(result.queue).toBe('erasegraph.dlq.cache-cleanup');
    expect(result.replayed).toBe(2);

    // Each message must have been published then acknowledged
    expect(mockChannel.publish).toHaveBeenCalledTimes(2);
    expect(mockChannel.ack).toHaveBeenCalledTimes(2);

    // Published to the correct exchange and routing key
    expect(mockChannel.publish).toHaveBeenCalledWith(
      'erasegraph.events',
      'deletion.requested.cache',
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({ 'replayed-from-dlq': 'erasegraph.dlq.cache-cleanup' }),
      }),
    );

    // Connection and channel are cleaned up
    expect(mockChannel.close).toHaveBeenCalledTimes(1);
    expect(mockConnection.close).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 2: unsupported queue name throws NotFoundException
  // -------------------------------------------------------------------------
  it('throws NotFoundException for an unsupported DLQ queue name', async () => {
    await expect(service.replay('not-a-real-queue')).rejects.toThrow(NotFoundException);
    await expect(service.replay('not-a-real-queue')).rejects.toThrow(
      'Unsupported DLQ replay target: not-a-real-queue',
    );
    // No RabbitMQ connection should have been attempted
    expect(mockedAmqp.connect).not.toHaveBeenCalled();
  });
});
