import { NotificationConsumerService } from './notification-consumer.service';
import { ConfigService } from '@nestjs/config';

describe('NotificationConsumerService', () => {
  let service: NotificationConsumerService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn().mockResolvedValue({ rowCount: 1 });
    service = new NotificationConsumerService({
      get: jest.fn(),
    } as unknown as ConfigService);
    (service as any).pgPool = { query: mockQuery };
  });

  it('writes DELETION_COMPLETE to deletion_notifications on success lifecycle', async () => {
    await (service as any).handleLifecycle({
      eventType: 'DeletionCompleted',
      request_id: '550e8400-e29b-41d4-a716-446655440003',
      subject_id: 'user-x',
      status: 'COMPLETED',
      completed_steps: ['primary_data', 'cache'],
    });

    expect(mockQuery).toHaveBeenCalled();
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql.toLowerCase()).toMatch(/insert into deletion_notifications/);
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain('DELETION_COMPLETE');
  });

  it('writes DELETION_FAILED when lifecycle indicates failure', async () => {
    await (service as any).handleLifecycle({
      eventType: 'DeletionFailed',
      request_id: '550e8400-e29b-41d4-a716-446655440004',
      subject_id: 'user-y',
      reason: 'downstream timeout',
      failed_steps: ['cache'],
    });

    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain('DELETION_FAILED');
  });
});
