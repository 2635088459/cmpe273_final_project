describe('EventPublisherService', () => {
  let service: any;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    const { EventPublisherService } = require('./event-publisher.service');

    configService = { get: jest.fn().mockReturnValue('amqp://test') };
    service = new EventPublisherService(configService as any);

    service.channel = {
      publish: jest.fn().mockReturnValue(true),
      assertExchange: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    service.connection = {
      createChannel: jest.fn().mockResolvedValue(service.channel),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    jest.spyOn(service as any, 'connect').mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it('publishDeletionRequested publishes with deletion.requested routing key', async () => {
    await service.publishDeletionRequested({
      event_id: 'evt-1',
      request_id: 'req-1',
      subject_id: 'alice',
      trace_id: 'tr-1',
      timestamp: '2026-05-09T18:00:00.000Z',
    });

    expect(service.channel.publish).toHaveBeenCalledTimes(1);
    expect(service.channel.publish.mock.calls[0][1]).toBe('deletion.requested');
  });

  it('publishDeletionCompleted publishes lifecycle message', async () => {
    await service.publishDeletionCompleted({
      request_id: 'req-2',
      subject_id: 'bob',
      trace_id: 'tr-2',
      completed_steps: ['primary_data', 'cache'],
      status: 'COMPLETED',
    });

    expect(service.channel.publish).toHaveBeenCalledTimes(1);
    expect(service.channel.publish.mock.calls[0][1]).toBe('deletion.completed');
  });

  it('publishDeletionFailed publishes lifecycle failure message', async () => {
    await service.publishDeletionFailed({
      request_id: 'req-3',
      subject_id: 'charlie',
      trace_id: 'tr-3',
      reason: 'step failed',
      failed_steps: ['cache'],
    });

    expect(service.channel.publish).toHaveBeenCalledTimes(1);
    expect(service.channel.publish.mock.calls[0][1]).toBe('deletion.failed');
  });
});
