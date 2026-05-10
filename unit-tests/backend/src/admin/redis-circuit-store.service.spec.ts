import { RedisCircuitStore } from './redis-circuit-store.service';

describe('RedisCircuitStore', () => {
  let service: RedisCircuitStore;

  beforeEach(() => {
    service = new RedisCircuitStore({ get: jest.fn().mockReturnValue('redis://localhost:6379') } as any);
  });

  it('serialize encodes RESP payload', () => {
    const payload = (service as any).serialize(['GET', 'my-key']);

    expect(payload).toContain('*2');
    expect(payload).toContain('$3\r\nGET\r\n');
    expect(payload).toContain('$6\r\nmy-key\r\n');
  });

  it('parseBulkString returns null for missing key', () => {
    const value = (service as any).parseBulkString('$-1\r\n');
    expect(value).toBeNull();
  });

  it('parseBulkString returns string value for bulk response', () => {
    const value = (service as any).parseBulkString('$5\r\nhello\r\n');
    expect(value).toBe('hello');
  });
});
