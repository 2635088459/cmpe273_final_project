import { Injectable, Logger } from '@nestjs/common';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign,
} from 'node:crypto';
import { stableStringify } from './proof-hash.util';

type SignatureBlock = {
  algorithm: 'Ed25519';
  key_id: string;
  signature_base64: string;
  signed_payload_sha256: string;
};

@Injectable()
export class ProofAttestationService {
  private readonly logger = new Logger(ProofAttestationService.name);
  private readonly privateKey: KeyObject;
  private readonly publicKeyPem: string;
  private readonly keyId: string;

  constructor() {
    const configuredPrivatePem = process.env.PROOF_SIGNING_PRIVATE_KEY_PEM;

    if (configuredPrivatePem) {
      this.privateKey = createPrivateKey(configuredPrivatePem);
      this.publicKeyPem = createPublicKey(this.privateKey).export({ type: 'spki', format: 'pem' }).toString();
      this.keyId = this.computeKeyId(this.publicKeyPem);
      this.logger.log(`Loaded proof signing key from environment (key_id=${this.keyId})`);
      return;
    }

    const generated = generateKeyPairSync('ed25519');
    this.privateKey = generated.privateKey;
    this.publicKeyPem = generated.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    this.keyId = this.computeKeyId(this.publicKeyPem);
    this.logger.warn(
      `PROOF_SIGNING_PRIVATE_KEY_PEM not set. Using ephemeral signing key (key_id=${this.keyId}) for demo runtime only.`,
    );
  }

  getPublicKey(): { key_id: string; algorithm: 'Ed25519'; public_key_pem: string } {
    return {
      key_id: this.keyId,
      algorithm: 'Ed25519',
      public_key_pem: this.publicKeyPem,
    };
  }

  signPayload(payload: Record<string, unknown>): SignatureBlock {
    const canonicalPayload = stableStringify(payload);
    const payloadBytes = Buffer.from(canonicalPayload, 'utf8');
    const signature = sign(null, payloadBytes, this.privateKey);
    const payloadDigest = createHash('sha256').update(payloadBytes).digest('hex');

    return {
      algorithm: 'Ed25519',
      key_id: this.keyId,
      signature_base64: signature.toString('base64'),
      signed_payload_sha256: payloadDigest,
    };
  }

  private computeKeyId(publicKeyPem: string): string {
    return createHash('sha256').update(publicKeyPem, 'utf8').digest('hex').slice(0, 16);
  }
}