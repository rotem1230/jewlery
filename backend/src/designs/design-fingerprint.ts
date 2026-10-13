import { createHash } from 'crypto';

/**
 * JSON with object keys in sorted order: the same value always gives the same text, whatever order
 * its keys were written in (PostgreSQL jsonb does not keep the client's key order).
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** What a quote priced: a fingerprint of the design's parameters when the quote was made. */
export function designFingerprint(parameters: unknown): string {
  return createHash('sha256').update(stableJson(parameters)).digest('hex');
}
