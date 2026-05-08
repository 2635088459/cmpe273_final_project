import { AnalyticsConsumerService } from './analytics-consumer.service';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../types/events';

describe('AnalyticsConsumerService', () => {
  let service: AnalyticsConsumerService;

  beforeEach(() => {
    service = new AnalyticsConsumerService({
      get: jest.fn((k: string, def?: unknown) => {
        if (k === 'ANALYTICS_DELAY_MS') return '100';
        return def;
      }),
    } as unknown as ConfigService);
  });

  it('soft-deletes analytics rows (sets deleted_at) instead of hard delete', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rowCount: 3 });
    const mockPublish = jest.fn();
    (service as any).pgPool = { query: mockQuery };
    (service as any).publisherChannel = {
      publish: mockPublish,
      assertExchange: jest.fn(),
    };

    jest.useFakeTimers();
    const p = (service as any).processDeletion({
      request_id: '550e8400-e29b-41d4-a716-446655440001',
      subject_id: 'cust-99',
      trace_id: 'tr',
      timestamp: new Date().toISOString(),
    });
    await jest.advanceTimersByTimeAsync(150);
    await p;
    jest.useRealTimers();

    const updateCall = mockQuery.mock.calls.find((c) =>
      String(c[0]).toLowerCase().includes('update analytics_events'),
    );
    expect(updateCall).toBeDefined();
    expect(String(updateCall[0]).toLowerCase()).toMatch(/deleted_at/);
    expect(updateCall[1]).toEqual(['cust-99']);

    expect(mockPublish).toHaveBeenCalled();
    const [, rk] = mockPublish.mock.calls[mockPublish.mock.calls.length - 1];
    expect(rk).toBe('step.succeeded');
    const body = JSON.parse(mockPublish.mock.calls[mockPublish.mock.calls.length - 1][2].toString());
    expect(body.eventType).toBe(EventTypes.DELETION_STEP_SUCCEEDED);
  });

  it('waits at least the configured delay before publishing success', async () => {
    const svc = new AnalyticsConsumerService({
      get: jest.fn((k: string) => (k === 'ANALYTICS_DELAY_MS' ? '400' : undefined)),
    } as unknown as ConfigService);
    const mockQuery = jest.fn().mockResolvedValue({ rowCount: 0 });
    const mockPublish = jest.fn();
    (svc as any).pgPool = { query: mockQuery };
    (svc as any).publisherChannel = { publish: mockPublish, assertExchange: jest.fn() };

    jest.useFakeTimers();
    const run = (svc as any).processDeletion({
      request_id: '550e8400-e29b-41d4-a716-446655440002',
      subject_id: 's',
      trace_id: 't',
      timestamp: new Date().toISOString(),
    });

    await jest.advanceTimersByTimeAsync(200);
    expect(mockPublish).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(250);
    await run;
    jest.useRealTimers();

    expect(mockPublish).toHaveBeenCalled();
  });
});
