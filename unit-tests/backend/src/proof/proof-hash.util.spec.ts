import {
  computeProofEventHash,
  genesisHashForRequest,
  stableStringify,
} from './proof-hash.util';

describe('ProofHashUtil', () => {
  const rid = 'b3d7a3e8-1234-4abc-9def-0123456789ab';
  const prev = genesisHashForRequest(rid);
  const basePayload = { step: 'cache', n: 1 };
  const ts = '2026-05-07T12:00:00.000Z';

  it('produces a different hash when any input field changes', () => {
    const h0 = computeProofEventHash(prev, rid, 'svcA', 'DeletionStepSucceeded', basePayload, ts);
    expect(computeProofEventHash(prev, rid, 'svcB', 'DeletionStepSucceeded', basePayload, ts)).not.toBe(h0);
    expect(computeProofEventHash(prev, rid, 'svcA', 'DeletionStepFailed', basePayload, ts)).not.toBe(h0);
    expect(
      computeProofEventHash(prev, rid, 'svcA', 'DeletionStepSucceeded', { ...basePayload, n: 2 }, ts),
    ).not.toBe(h0);
    expect(
      computeProofEventHash('other-prev', rid, 'svcA', 'DeletionStepSucceeded', basePayload, ts),
    ).not.toBe(h0);
    expect(computeProofEventHash(prev, rid, 'svcA', 'DeletionStepSucceeded', basePayload, ts + '1')).not.toBe(
      h0,
    );
  });

  it('breaks chain verification when a previous event hash is tampered (different subsequent hash)', () => {
    const p1 = { a: 1, timestamp: ts };
    const h1 = computeProofEventHash(prev, rid, 'svc1', 'T1', p1, ts);
    const p2 = { b: 2, timestamp: ts };
    const h2good = computeProofEventHash(h1, rid, 'svc2', 'T2', p2, ts);
    const h1_fake = h1.replace(/a/g, 'b');
    const h2broken = computeProofEventHash(h1_fake, rid, 'svc2', 'T2', p2, ts);
    expect(h2good).not.toBe(h2broken);
  });

  it('stableStringify orders object keys deterministically', () => {
    expect(stableStringify({ z: 1, a: 2 })).toBe(stableStringify({ a: 2, z: 1 }));
  });
});
