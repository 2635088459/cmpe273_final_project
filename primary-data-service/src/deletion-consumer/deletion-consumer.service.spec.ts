import { DeletionConsumerService } from './deletion-consumer.service';

describe('DeletionConsumerService', () => {
  let service: DeletionConsumerService;
  let userRepository: any;

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    service = new DeletionConsumerService(
      { get: jest.fn().mockReturnValue('amqp://test') } as any,
      userRepository,
    );

    (service as any).publisherChannel = { publish: jest.fn() };
  });

  afterEach(() => jest.clearAllMocks());

  it('processDeletion publishes succeeded when user exists', async () => {
    userRepository.findOne.mockResolvedValueOnce({
      id: 'a1b2c3d4-1111-4111-8111-111111111111',
      username: 'alice',
      email: 'alice@example.com',
    });

    await (service as any).processDeletion({
      event_id: 'evt-1',
      request_id: 'req-1',
      subject_id: 'alice',
      trace_id: 'tr-1',
      timestamp: '2026-05-09T18:40:00.000Z',
    });

    expect(userRepository.remove).toHaveBeenCalledTimes(1);
    expect((service as any).publisherChannel.publish).toHaveBeenCalledTimes(1);
    expect((service as any).publisherChannel.publish.mock.calls[0][1]).toBe('step.succeeded');
  });

  it('processDeletion publishes failed when repository throws', async () => {
    userRepository.findOne.mockRejectedValueOnce(new Error('db failed'));

    await (service as any).processDeletion({
      event_id: 'evt-2',
      request_id: 'req-2',
      subject_id: 'bob',
      trace_id: 'tr-2',
      timestamp: '2026-05-09T18:41:00.000Z',
    });

    expect((service as any).publisherChannel.publish).toHaveBeenCalledTimes(1);
    expect((service as any).publisherChannel.publish.mock.calls[0][1]).toBe('step.failed');
  });
});
