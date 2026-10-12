import { createHmac } from 'crypto';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { bearer, registerVerified } from '../utils/factories';

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signHs256(payload: Record<string, unknown>, secret: string, header = { alg: 'HS256', typ: 'JWT' }) {
  const head = base64url(JSON.stringify(header));
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

describe('refresh token rotation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function refresh(refreshToken: string) {
    return t.http.post(`${API}/auth/refresh`).send({ refreshToken });
  }

  it('rotation invalidates the presented token', async () => {
    const user = await registerVerified(t);
    const first = await refresh(user.refreshToken);
    expect(first.status).toBe(201);
    expect((await refresh(user.refreshToken)).status).toBe(401);
  });

  it('replaying a rotated token revokes the whole session family', async () => {
    const user = await registerVerified(t);
    const rotated = await refresh(user.refreshToken);
    const successor = rotated.body.data.tokens.refreshToken as string;

    expect((await refresh(user.refreshToken)).status).toBe(401);
    expect((await refresh(successor)).status).toBe(401);
  });

  it('two simultaneous refreshes with one token yield a single new session', async () => {
    const user = await registerVerified(t);
    const results = await Promise.all([refresh(user.refreshToken), refresh(user.refreshToken)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 401]);
  });

  it('a suspended account cannot refresh', async () => {
    const user = await registerVerified(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    expect((await refresh(user.refreshToken)).status).toBe(401);
  });
});

describe('access token verification', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('rejects alg=none tokens', async () => {
    const user = await registerVerified(t);
    const head = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const body = base64url(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 600 }));
    await t.http.get(`${API}/designs`).set(bearer(`${head}.${body}.`)).expect(401);
  });

  it('rejects a token signed with another secret', async () => {
    const user = await registerVerified(t);
    const forged = signHs256(
      { sub: user.id, exp: Math.floor(Date.now() / 1000) + 600 },
      'dev-only-secret-change-in-production-min-32-chars',
    );
    await t.http.get(`${API}/designs`).set(bearer(forged)).expect(401);
  });

  it('rejects a correctly signed token that lacks the API issuer and audience', async () => {
    const user = await registerVerified(t);
    const bare = signHs256(
      { sub: user.id, exp: Math.floor(Date.now() / 1000) + 600 },
      process.env.JWT_SECRET as string,
    );
    await t.http.get(`${API}/designs`).set(bearer(bare)).expect(401);
  });

  it('accepts the tokens the API itself issues', async () => {
    const user = await registerVerified(t);
    await t.http.get(`${API}/designs`).set(user.auth).expect(200);
  });
});
