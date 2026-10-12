import { createSign, generateKeyPairSync, JsonWebKey, KeyObject } from 'crypto';

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** A local identity provider: RSA key pair + JWK, signs RS256 ID tokens for tests. */
export class TestIdentityProvider {
  readonly jwk: JsonWebKey & { kid: string; alg: string; use: string };
  private readonly privateKey: KeyObject;

  constructor(readonly kid = 'test-kid-1') {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privateKey = privateKey;
    this.jwk = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid, alg: 'RS256', use: 'sig' };
  }

  sign(claims: Record<string, unknown>, header: Record<string, unknown> = {}): string {
    const head = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: this.kid, ...header }));
    const body = base64url(JSON.stringify(claims));
    const signature = createSign('RSA-SHA256').update(`${head}.${body}`).sign(this.privateKey);
    return `${head}.${body}.${base64url(signature)}`;
  }
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
