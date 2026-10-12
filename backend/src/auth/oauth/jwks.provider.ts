import { Injectable } from '@nestjs/common';
import { JwkWithId } from './jwt-rs256';

export const JWKS_PROVIDER = Symbol('JWKS_PROVIDER');

export interface JwksProvider {
  /** Signing keys published at `jwksUri`; `forceRefresh` bypasses the cache (key rotation). */
  getKeys(jwksUri: string, forceRefresh?: boolean): Promise<JwkWithId[]>;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

/** Fetches provider JWK sets over HTTPS with a timeout, no redirects, and a one-hour cache. */
@Injectable()
export class HttpJwksProvider implements JwksProvider {
  private readonly cache = new Map<string, { keys: JwkWithId[]; expiresAt: number }>();

  async getKeys(jwksUri: string, forceRefresh = false): Promise<JwkWithId[]> {
    const cached = this.cache.get(jwksUri);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.keys;
    }
    const res = await fetch(jwksUri, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
    if (!res.ok) {
      throw new Error(`JWKS endpoint answered ${res.status}`);
    }
    const body = (await res.json()) as { keys?: unknown };
    const keys = Array.isArray(body.keys) ? (body.keys as JwkWithId[]) : [];
    this.cache.set(jwksUri, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
    return keys;
  }
}
