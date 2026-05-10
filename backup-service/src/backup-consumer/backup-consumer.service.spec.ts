import { BackupConsumerService } from './backup-consumer.service';

describe('BackupConsumerService', () => {
  let service: BackupConsumerService;

  beforeEach(() => {
    service = new BackupConsumerService({ get: jest.fn().mockReturnValue('amqp://test') } as any);
  });

  it('buildSimulatedArtifacts returns expected artifact entries', () => {
    const artifacts = (service as any).buildSimulatedArtifacts('alice');

    expect(artifacts).toHaveLength(3);
    expect(artifacts[0].artifact_path).toContain('/alice/');
  });

  it('publishSucceeded publishes step.succeeded event', async () => {
    const publish = jest.fn();
    (service as any).publisherChannel = { publish };

    await (service as any).publishSucceeded({
      request_id: 'req-1',
      step_name: 'backup',
      service_name: 'backup',
      trace_id: 'tr-1',
      timestamp: '2026-05-09T18:30:00.000Z',
      metadata: {},
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1]).toBe('step.succeeded');
  });
});
