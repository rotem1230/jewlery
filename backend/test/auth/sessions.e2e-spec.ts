import { createHmac } from 'crypto';
import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { bearer, login, registerVerified } from '../utils/factories';

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

  it('a refresh that fails midway leaves the presented token usable (no false theft alarm)', async () => {
    const user = await registerVerified(t);
    await t.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_refresh_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW."userId" = '${user.id}'::uuid THEN RAISE EXCEPTION 'injected refresh failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await t.prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_refresh_insert BEFORE INSERT ON "refresh_tokens"
      FOR EACH ROW EXECUTE FUNCTION test_fail_refresh_insert()`);
    try {
      expect((await refresh(user.refreshToken)).status).toBeGreaterThanOrEqual(500);
    } finally {
      await t.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_refresh_insert ON "refresh_tokens"`);
      await t.prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_refresh_insert()`);
    }
    expect((await refresh(user.refreshToken)).status).toBe(201);
  });

  it('a suspended account cannot refresh', async () => {
    const user = await registerVerified(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    expect((await refresh(user.refreshToken)).status).toBe(401);
  });
});

/**
 * Regression: ending sessions (sign out everywhere, password change or reset) only revoked refresh
 * tokens; every access token already handed out kept working until it expired, and a refresh that
 * raced the revocation could leave a fresh session behind.
 */
describe('ending sessions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  function me(accessToken: string) {
    return t.http.get(`${API}/users/me`).set(bearer(accessToken));
  }

  it('signing out everywhere ends the access tokens already handed out', async () => {
    const user = await registerVerified(t);
    await me(user.accessToken).expect(200);
    await t.http.post(`${API}/auth/revoke-all`).set(user.auth).send({}).expect(200);
    await me(user.accessToken).expect(401);
  });

  it('a session started after signing out everywhere works', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/auth/revoke-all`).set(user.auth).send({}).expect(200);
    const again = await login(t, user.email, user.password);
    await me(again.accessToken).expect(200);
    await t.http.post(`${API}/auth/refresh`).send({ refreshToken: again.refreshToken }).expect(201);
  });

  it('changing the password ends every session at once, on other devices too', async () => {
    const user = await registerVerified(t);
    const otherDevice = await login(t, user.email, user.password);
    await t.http
      .patch(`${API}/users/me/password`)
      .set(user.auth)
      .send({ currentPassword: user.password, newPassword: 'N3w-Strong-Pass' })
      .expect(200);
    await me(otherDevice.accessToken).expect(401);
    await t.http.post(`${API}/auth/refresh`).send({ refreshToken: otherDevice.refreshToken }).expect(401);
    const fresh = await login(t, user.email, 'N3w-Strong-Pass');
    await me(fresh.accessToken).expect(200);
  });

  it('a password reset ends the access tokens already handed out', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
    const token = await t.mailbox.tokenFor(user.email, 'reset');
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: 'N3w-Strong-Pass' }).expect(200);
    await me(user.accessToken).expect(401);
  });

  it('a refresh racing sign-out-everywhere cannot leave a working session behind', async () => {
    const user = await registerVerified(t);
    const held = await lockRow(t, 'users', user.id);
    const refreshing = t.http.post(`${API}/auth/refresh`).send({ refreshToken: user.refreshToken }).then((res) => res);
    await waitForLockWaiters(t, 1);
    const revoking = t.http.post(`${API}/auth/revoke-all`).set(user.auth).send({}).then((res) => res);
    await waitForLockWaiters(t, 2);
    await held.release();

    const refreshed = await refreshing;
    expect((await revoking).status).toBe(200);
    expect([201, 401]).toContain(refreshed.status);
    if (refreshed.status === 201) {
      const tokens = refreshed.body.data.tokens as { accessToken: string; refreshToken: string };
      await me(tokens.accessToken).expect(401);
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401);
    }
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
