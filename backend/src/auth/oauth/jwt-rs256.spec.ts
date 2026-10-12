import { createHmac } from 'crypto';
import { nowSeconds, TestIdentityProvider } from '../../../test/utils/oauth';
import { verifyRs256Jwt } from './jwt-rs256';

const OPTIONS = { issuers: ['https://issuer.test'], audiences: ['client-a'] };

function claims(extra: Record<string, unknown> = {}) {
  return { iss: 'https://issuer.test', aud: 'client-a', sub: 'user-1', iat: nowSeconds(), exp: nowSeconds() + 300, ...extra };
}

function b64(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

describe('verifyRs256Jwt', () => {
  const idp = new TestIdentityProvider();
  const keys = [idp.jwk];

  it('returns the payload of a valid token', () => {
    expect(verifyRs256Jwt(idp.sign(claims()), keys, OPTIONS).sub).toBe('user-1');
  });

  it('accepts an audience array that contains the client', () => {
    expect(verifyRs256Jwt(idp.sign(claims({ aud: ['other', 'client-a'] })), keys, OPTIONS).sub).toBe('user-1');
  });

  it.each([
    ['wrong audience', claims({ aud: 'client-b' })],
    ['wrong issuer', claims({ iss: 'https://evil.test' })],
    ['expired', claims({ exp: nowSeconds() - 120 })],
    ['missing exp', claims({ exp: undefined })],
    ['issued in the future', claims({ iat: nowSeconds() + 3600 })],
    ['not yet valid', claims({ nbf: nowSeconds() + 3600 })],
    ['missing subject', claims({ sub: undefined })],
  ])('rejects a token with %s', (_label, payload) => {
    expect(() => verifyRs256Jwt(idp.sign(payload), keys, OPTIONS)).toThrow();
  });

  it('rejects a token whose key id is unknown', () => {
    expect(() => verifyRs256Jwt(idp.sign(claims(), { kid: 'other-kid' }), keys, OPTIONS)).toThrow();
  });

  it('rejects a forged signature', () => {
    const forger = new TestIdentityProvider(idp.kid);
    expect(() => verifyRs256Jwt(forger.sign(claims()), keys, OPTIONS)).toThrow();
  });

  it('rejects alg=none', () => {
    const token = `${b64(JSON.stringify({ alg: 'none', kid: idp.kid }))}.${b64(JSON.stringify(claims()))}.`;
    expect(() => verifyRs256Jwt(token, keys, OPTIONS)).toThrow();
  });

  it('rejects HS256 tokens keyed with public material (algorithm confusion)', () => {
    const head = b64(JSON.stringify({ alg: 'HS256', kid: idp.kid }));
    const body = b64(JSON.stringify(claims()));
    const sig = createHmac('sha256', JSON.stringify(idp.jwk)).update(`${head}.${body}`).digest('base64url');
    expect(() => verifyRs256Jwt(`${head}.${body}.${sig}`, keys, OPTIONS)).toThrow();
  });

  it('rejects malformed input', () => {
    expect(() => verifyRs256Jwt('not-a-jwt', keys, OPTIONS)).toThrow();
    expect(() => verifyRs256Jwt('a.b.c', keys, OPTIONS)).toThrow();
  });
});
