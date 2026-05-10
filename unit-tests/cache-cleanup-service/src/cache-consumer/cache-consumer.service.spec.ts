import { CacheConsumerService } from './cache-consumer.service';

describe('CacheConsumerService', () => {
  let service: CacheConsumerService;

  beforeEach(() => {
    service = new CacheConsumerService({ get: jest.fn().mockReturnValue('false') } as any);
  });

  it('truncateText shortens long text with ellipsis', () => {
    const value = (service as any).truncateText('abcdefghijklmnopqrstuvwxyz', 10);
    expect(value).toBe('abcdefg...');
  });

  it('buildCachePreview parses json object and truncates string fields', () => {
    const raw = JSON.stringify({
      a: 'x'.repeat(120),
      b: 2,
      c: true,
    });

    const preview = (service as any).buildCachePreview(raw) as Record<string, unknown>;
    expect(preview.a).toBeDefined();
    expect(String(preview.a).length).toBeLessThanOrEqual(80);
    expect(preview.b).toBe(2);
  });

  it('buildCachePreview returns truncated raw text for non-json', () => {
    const preview = (service as any).buildCachePreview('y'.repeat(140));
    expect(typeof preview).toBe('string');
    expect((preview as string).endsWith('...')).toBe(true);
  });
});
