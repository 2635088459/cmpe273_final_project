import * as crypto from 'crypto';

export function genesisHashForRequest(requestId: string): string {
  return crypto.createHash('sha256').update(`GENESIS|${requestId}`, 'utf8').digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export function computeProofEventHash(
  previousHash: string,
  requestId: string,
  serviceName: string,
  eventType: string,
  payload: Record<string, unknown>,
  timestampIso: string
): string {
  const payloadStr = stableStringify(payload);
  const preimage = `${previousHash}|${requestId}|${serviceName}|${eventType}|${payloadStr}|${timestampIso}`;
  return crypto.createHash('sha256').update(preimage, 'utf8').digest('hex');
}
