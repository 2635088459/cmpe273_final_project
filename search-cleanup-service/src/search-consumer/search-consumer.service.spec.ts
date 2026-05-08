import { SearchConsumerService } from './search-consumer.service';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../types/events';

describe('SearchConsumerService', () => {
  let service: SearchConsumerService;

  beforeEach(() => {
    service = new SearchConsumerService({
      get: jest.fn((_k: string, def?: unknown) => def),
    } as unknown as ConfigService);
  });

  it('deletes search_index_documents rows for the subject and publishes step succeeded', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rowCount: 2 });
    const mockPublish = jest.fn();
    (service as any).pgPool = { query: mockQuery };
    (service as any).publisherChannel = {
      publish: mockPublish,
      assertExchange: jest.fn(),
    };

    await (service as any).processDeletion({
      request_id: '550e8400-e29b-41d4-a716-446655440000',
      subject_id: 'alice@example.com',
      trace_id: 'trace-1',
      timestamp: new Date().toISOString(),
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM search_index_documents/i),
      ['alice@example.com'],
    );

    expect(mockPublish).toHaveBeenCalled();
    const [, routingKey, buf] = mockPublish.mock.calls[0];
    expect(routingKey).toBe('step.succeeded');
    const body = JSON.parse(buf.toString());
    expect(body.eventType).toBe(EventTypes.DELETION_STEP_SUCCEEDED);
    expect(body.step_name).toBe('search_cleanup');
  });
});
