import { createPublicKey, verify } from 'node:crypto';
import { ProofAttestationService } from './proof-attestation.service';
import { stableStringify } from './proof-hash.util';

describe('ProofAttestationService', () => {
  let service: ProofAttestationService;

  beforeEach(() => {
    delete process.env.PROOF_SIGNING_PRIVATE_KEY_PEM;
    service = new ProofAttestationService();
  });

  afterEach(() => {
    delete process.env.PROOF_SIGNING_PRIVATE_KEY_PEM;
    jest.clearAllMocks();
  });

  it('returns public key metadata', () => {
    const key = service.getPublicKey();

    expect(key.algorithm).toBe('Ed25519');
    expect(key.key_id).toHaveLength(16);
    expect(key.public_key_pem).toContain('BEGIN PUBLIC KEY');
  });

  it('signPayload produces verifiable Ed25519 signature and digest', () => {
    const payload = { b: 2, a: 1, nested: { z: true, x: 10 } };

    const signatureBlock = service.signPayload(payload);
    const publicKey = service.getPublicKey();

    expect(signatureBlock.algorithm).toBe('Ed25519');
    expect(signatureBlock.key_id).toBe(publicKey.key_id);
    expect(signatureBlock.signed_payload_sha256).toHaveLength(64);

    const payloadBytes = Buffer.from(stableStringify(payload), 'utf8');
    const ok = verify(
      null,
      payloadBytes,
      createPublicKey(publicKey.public_key_pem),
      Buffer.from(signatureBlock.signature_base64, 'base64'),
    );

    expect(ok).toBe(true);
  });
});
