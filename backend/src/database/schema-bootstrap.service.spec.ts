import { SchemaBootstrapService } from './schema-bootstrap.service';

describe('SchemaBootstrapService', () => {
  it('runs schema bootstrap SQL statements on module init', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const service = new SchemaBootstrapService({ query } as any);

    await service.onModuleInit();

    expect(query).toHaveBeenCalled();
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(query.mock.calls.some((c: any[]) => String(c[0]).includes('processed_events'))).toBe(true);
    expect(query.mock.calls.some((c: any[]) => String(c[0]).includes('deletion_notifications'))).toBe(true);
  });
});
