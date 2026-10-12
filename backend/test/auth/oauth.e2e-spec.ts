import { JWKS_PROVIDER } from '../../src/auth/oauth/jwks.provider';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { nowSeconds, TestIdentityProvider } from '../utils/oauth';

const GOOGLE_CLIENT = 'google-client-test.apps.googleusercontent.com';
const APPLE_CLIENT = 'com.malinvosky.app';

async function enableOauth(t: TestApp) {
  await t.prisma.featureFlag.upsert({
    where: { key: 'phase3_oauth' },
    update: { enabled: true, rolloutPct: 100 },
    create: { key: 'phase3_oauth', enabled: true, rolloutPct: 100 },
  });
}

/**
 * Regressions: OAuth skipped the audience check when client ids were not configured (any
 * Google token for any app was accepted), Apple tokens never expired, and a client-supplied
 * e-mail was stored as verified when the token carried none.
 */
describe('OAuth sign-in', () => {
  const idp = new TestIdentityProvider();
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({
      env: { GOOGLE_CLIENT_ID: GOOGLE_CLIENT, APPLE_CLIENT_ID: APPLE_CLIENT },
      configure: (b) => b.overrideProvider(JWKS_PROVIDER).useValue({ getKeys: async () => [idp.jwk] }),
    });
    await enableOauth(t);
  });

  afterAll(async () => {
    await t.close();
  });

  function googleClaims(extra: Record<string, unknown> = {}) {
    const sub = `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT,
      sub,
      email: `${sub}@gmail.test`,
      email_verified: true,
      iat: nowSeconds(),
      exp: nowSeconds() + 600,
      ...extra,
    };
  }

  function appleClaims(extra: Record<string, unknown> = {}) {
    return {
      iss: 'https://appleid.apple.com',
      aud: APPLE_CLIENT,
      sub: `a-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      iat: nowSeconds(),
      exp: nowSeconds() + 600,
      ...extra,
    };
  }

  it('signs in with a valid Google token and keeps the account linked by subject', async () => {
    const claims = googleClaims();
    const first = await t.http.post(`${API}/auth/oauth/google`).send({ idToken: idp.sign(claims) }).expect(201);
    expect(first.body.data.user.email).toBe(claims.email);
    const second = await t.http.post(`${API}/auth/oauth/google`).send({ idToken: idp.sign(claims) }).expect(201);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
  });

  it('rejects a Google token issued for another application', async () => {
    const token = idp.sign(googleClaims({ aud: 'another-app.apps.googleusercontent.com' }));
    await t.http.post(`${API}/auth/oauth/google`).send({ idToken: token }).expect(401);
  });

  it('rejects a token from an unexpected issuer', async () => {
    const token = idp.sign(googleClaims({ iss: 'https://evil.example' }));
    await t.http.post(`${API}/auth/oauth/google`).send({ idToken: token }).expect(401);
  });

  it('rejects an expired Apple token', async () => {
    const token = idp.sign(appleClaims({ iat: nowSeconds() - 7200, exp: nowSeconds() - 3600 }));
    await t.http.post(`${API}/auth/oauth/apple`).send({ idToken: token }).expect(401);
  });

  it('rejects a token signed by an unknown key', async () => {
    const stranger = new TestIdentityProvider(idp.kid);
    await t.http.post(`${API}/auth/oauth/google`).send({ idToken: stranger.sign(googleClaims()) }).expect(401);
  });

  it('never trusts an e-mail supplied by the client', async () => {
    const claims = googleClaims({ email: undefined, email_verified: undefined });
    const res = await t.http
      .post(`${API}/auth/oauth/google`)
      .send({ idToken: idp.sign(claims), email: 'victim@corp.test' })
      .expect(201);
    expect(res.body.data.user.email).not.toBe('victim@corp.test');
    expect(await t.prisma.user.count({ where: { email: 'victim@corp.test' } })).toBe(0);
  });

  it('does not adopt a provider e-mail that the provider has not verified', async () => {
    const claims = googleClaims({ email: 'unverified@corp.test', email_verified: false });
    const res = await t.http.post(`${API}/auth/oauth/google`).send({ idToken: idp.sign(claims) }).expect(201);
    expect(res.body.data.user.email).not.toBe('unverified@corp.test');
  });
});

describe('OAuth sign-in without configured client ids', () => {
  const idp = new TestIdentityProvider();
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({
      env: { GOOGLE_CLIENT_ID: '', APPLE_CLIENT_ID: '' },
      configure: (b) => b.overrideProvider(JWKS_PROVIDER).useValue({ getKeys: async () => [idp.jwk] }),
    });
    await enableOauth(t);
  });

  afterAll(async () => {
    await t.close();
  });

  it('fails closed instead of skipping the audience check', async () => {
    const token = idp.sign({
      iss: 'https://accounts.google.com',
      aud: 'any-app.apps.googleusercontent.com',
      sub: 'g-fail-closed',
      iat: nowSeconds(),
      exp: nowSeconds() + 600,
    });
    const res = await t.http.post(`${API}/auth/oauth/google`).send({ idToken: token }).expect(503);
    expect(res.body.code).toBe('OAUTH_NOT_CONFIGURED');
  });
});
