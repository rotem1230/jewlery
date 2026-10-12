import { UserRole } from '@prisma/client';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { DEFAULT_PASSWORD, registerVerified, uniqueEmail } from '../utils/factories';

/**
 * Regressions for the login findings: account/status enumeration before the password check,
 * non-atomic failure counter, and unlimited guessing from one client.
 */
describe('login hardening', () => {
  describe('with default limits', () => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp();
    });

    afterAll(async () => {
      await t.close();
    });

    it('answers an unknown e-mail exactly like a wrong password', async () => {
      const user = await registerVerified(t);
      const unknown = await t.http
        .post(`${API}/auth/login`)
        .send({ email: uniqueEmail('nobody'), password: 'Whatever1!' })
        .expect(401);
      const wrong = await t.http
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'Wrong-pass1' })
        .expect(401);
      expect(unknown.body).toEqual(wrong.body);
    });

    it('does not reveal an unverified account to someone without the password', async () => {
      const email = uniqueEmail('pending');
      await t.http
        .post(`${API}/auth/register`)
        .send({ email, password: DEFAULT_PASSWORD, roles: [UserRole.DESIGNER] })
        .expect(201);
      const res = await t.http
        .post(`${API}/auth/login`)
        .send({ email, password: 'Wrong-pass1' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('tells the owner of an unverified account (correct password) to verify', async () => {
      const email = uniqueEmail('pending');
      await t.http
        .post(`${API}/auth/register`)
        .send({ email, password: DEFAULT_PASSWORD, roles: [UserRole.DESIGNER] })
        .expect(201);
      const res = await t.http
        .post(`${API}/auth/login`)
        .send({ email, password: DEFAULT_PASSWORD })
        .expect(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('does not reveal a suspended account to someone without the password', async () => {
      const user = await registerVerified(t);
      await t.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      const res = await t.http
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'Wrong-pass1' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('throttles repeated guesses for one account from one client', async () => {
      const user = await registerVerified(t);
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        const res = await t.http
          .post(`${API}/auth/login`)
          .send({ email: user.email, password: `Wrong-pass${i}` });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses.slice(5)).toEqual([429, 429]);
    });
  });

  describe('lockout', () => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp({
        env: { LOGIN_MAX_ATTEMPTS: '3', AUTH_LOGIN_THROTTLE_LIMIT: '1000' },
      });
    });

    afterAll(async () => {
      await t.close();
    });

    it('locks after the configured failures and then refuses even the right password', async () => {
      const user = await registerVerified(t);
      for (let i = 0; i < 3; i += 1) {
        await t.http
          .post(`${API}/auth/login`)
          .send({ email: user.email, password: 'Wrong-pass1' })
          .expect(401);
      }
      const res = await t.http
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('a successful login clears earlier failures', async () => {
      const user = await registerVerified(t);
      await t.http.post(`${API}/auth/login`).send({ email: user.email, password: 'Wrong-pass1' }).expect(401);
      await t.http.post(`${API}/auth/login`).send({ email: user.email, password: 'Wrong-pass1' }).expect(401);
      await t.http.post(`${API}/auth/login`).send({ email: user.email, password: user.password }).expect(201);
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.loginAttempts).toBe(0);
    });
  });

  describe('failure counter under concurrency', () => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp({
        env: { LOGIN_MAX_ATTEMPTS: '100', AUTH_LOGIN_THROTTLE_LIMIT: '1000' },
      });
    });

    afterAll(async () => {
      await t.close();
    });

    it('counts every one of N simultaneous failed attempts', async () => {
      const user = await registerVerified(t);
      const attempts = 8;
      await Promise.all(
        Array.from({ length: attempts }, (_, i) =>
          t.http.post(`${API}/auth/login`).send({ email: user.email, password: `Wrong-pass${i}` }),
        ),
      );
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.loginAttempts).toBe(attempts);
    });
  });
});
