import {
  computeProofEventHash,
  genesisHashForRequest,
  stableStringify,
} from './proof-hash.util';

describe('ProofHashUtil (proof-service)', () => {
  const requestId = '9f04a1c2-5e5e-4d0d-a1dc-5f6e9265b201';
  const prev = genesisHashForRequest(requestId);
  const payload = { b: 2, a: 1 };
  const ts = '2026-05-09T16:00:00.000Z';

  it('stableStringify keeps deterministic key order', () => {
    expect(stableStringify({ z: 1, a: 2, n: { y: 9, b: 7 } })).toBe(
      stableStringify({ n: { b: 7, y: 9 }, a: 2, z: 1 }),
    );
  });

  it('computeProofEventHash changes when payload changes', () => {
    const h1 = computeProofEventHash(prev, requestId, 'svc', 'T', payload, ts);
    const h2 = computeProofEventHash(prev, requestId, 'svc', 'T', { ...payload, b: 3 }, ts);
    expect(h1).not.toBe(h2);
  });

  it('genesis hash is deterministic per request id', () => {
    expect(genesisHashForRequest(requestId)).toBe(genesisHashForRequest(requestId));
    expect(genesisHashForRequest(requestId)).not.toBe(genesisHashForRequest('different-id'));
  });
});
