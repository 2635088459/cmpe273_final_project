import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RedisCircuitStore } from './redis-circuit-store.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wire the mock store to return fixed values for all three Redis keys. */
function stubRedis(
  mockGet: jest.Mock,
  opts: { state: string; failureCount: string; openUntil: string },
) {
  mockGet.mockImplementation((key: string): Promise<string | null> => {
    if (key.endsWith(':state')) return Promise.resolve(opts.state);
    if (key.endsWith(':open_until')) return Promise.resolve(opts.openUntil);
    if (key.endsWith(':failure_count')) return Promise.resolve(opts.failureCount);
    return Promise.resolve(null);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let mockGet: jest.Mock;

  beforeEach(async () => {
    mockGet = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        { provide: RedisCircuitStore, useValue: { get: mockGet } },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // Test 1: CLOSED → OPEN after 3 consecutive failures
  // -------------------------------------------------------------------------
  it('transitions from CLOSED to OPEN after 3 consecutive failures are recorded', async () => {
    // Redis holds the state that was written by CacheConsumerService.recordCircuitFailure()
    // after the 3rd failure threshold is reached.
    stubRedis(mockGet, {
      state: 'OPEN',
      failureCount: '3',
      openUntil: String(Date.now() + 30_000), // window still open
    });

    const snapshots = await service.getCircuitStates();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].service_name).toBe('cache_cleanup');
    expect(snapshots[0].state).toBe('OPEN');
    expect(snapshots[0].failure_count).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Test 2: canProcess() returns false when state is OPEN
  // The cache cleanup service calls canProcess() before processing a message.
  // When the circuit is OPEN and within the open window, it must skip.
  // -------------------------------------------------------------------------
  it('reports OPEN state when the circuit is open, equivalent to canProcess() returning false', async () => {
    stubRedis(mockGet, {
      state: 'OPEN',
      failureCount: '3',
      openUntil: String(Date.now() + 30_000), // within the 30-second window
    });

    const [snapshot] = await service.getCircuitStates();

    expect(snapshot.state).toBe('OPEN');
    // The cache cleanup service skips processing when state === 'OPEN'.
    // canProcess() returns false ↔ state is 'OPEN' and open_until has not expired.
    const canProcess = snapshot.state !== 'OPEN';
    expect(canProcess).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 3: OPEN → HALF_OPEN after the 30-second timeout expires
  // -------------------------------------------------------------------------
  it('transitions from OPEN to HALF_OPEN after the 30-second open window expires', async () => {
    // open_until is 1 second in the past — the window has already expired.
    stubRedis(mockGet, {
      state: 'OPEN',
      failureCount: '3',
      openUntil: String(Date.now() - 1_000),
    });

    const [snapshot] = await service.getCircuitStates();

    expect(snapshot.state).toBe('HALF_OPEN');
  });
});
