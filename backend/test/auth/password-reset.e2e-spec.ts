import { UserRole } from '@prisma/client';
import { AuthService } from '../../src/auth/auth.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { DEFAULT_PASSWORD, registerVerified, uniqueEmail } from '../utils/factories';

const NEW_PASSWORD = 'N3w-Strong-Pass';

describe('password reset', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  /** Every mail the requests so far will send has been sent (background jobs included). */
  async function mailDone(): Promise<void> {
    await t.app.get(AuthService).drainPendingMail();
    await t.mailbox.settle();
  }

  async function requestReset(email: string): Promise<string> {
    const before = t.mailbox.to(email).length;
    await t.http.post(`${API}/auth/forgot-password`).send({ email }).expect(200);
    await t.mailbox.waitForMoreThan(email, before);
    return await t.mailbox.tokenFor(email, 'reset');
  }

  it('the reset e-mail is in Hebrew first, and its link is exactly the one issued', async () => {
    const user = await registerVerified(t);
    const token = await requestReset(user.email);
    const mail = t.mailbox.to(user.email).filter((m) => m.body.includes('reset-password')).pop();
    expect(mail?.subject).toMatch(/[֐-׿]/);
    expect(mail?.subject).not.toMatch(/[A-Za-z]{3,}/);
    const lines = mail?.body.split('\n') ?? [];
    expect(lines[0]).toMatch(/[֐-׿]/);
    expect(lines).toContain(`http://localhost:3000/api/v1/auth/web/reset-password?token=${token}`);
    expect(mail?.body).toMatch(/reset your Malinvosky password/);
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: NEW_PASSWORD }).expect(200);
  });

  it('a weak new password does not burn the reset token', async () => {
    const user = await registerVerified(t);
    const token = await requestReset(user.email);
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: 'abcdefgh' }).expect(400);
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: NEW_PASSWORD }).expect(200);
    await t.http.post(`${API}/auth/login`).send({ email: user.email, password: NEW_PASSWORD }).expect(201);
  });

  it('a reset token works exactly once under concurrent use', async () => {
    const user = await registerVerified(t);
    const token = await requestReset(user.email);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: `${NEW_PASSWORD}${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(4);
  });

  it('reset revokes every existing session', async () => {
    const user = await registerVerified(t);
    const token = await requestReset(user.email);
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: NEW_PASSWORD }).expect(200);
    await t.http.post(`${API}/auth/refresh`).send({ refreshToken: user.refreshToken }).expect(401);
  });

  it('reset clears a lockout', async () => {
    const user = await registerVerified(t);
    await t.prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() + 60 * 60_000), loginAttempts: 0 },
    });
    const token = await requestReset(user.email);
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: NEW_PASSWORD }).expect(200);
    await t.http.post(`${API}/auth/login`).send({ email: user.email, password: NEW_PASSWORD }).expect(201);
  });

  it('completing a reset proves mailbox ownership and activates a pending account', async () => {
    const email = uniqueEmail('pending');
    await t.http
      .post(`${API}/auth/register`)
      .send({ email, password: DEFAULT_PASSWORD, roles: [UserRole.DESIGNER] })
      .expect(201);
    const token = await requestReset(email);
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: NEW_PASSWORD }).expect(200);
    await t.http.post(`${API}/auth/login`).send({ email, password: NEW_PASSWORD }).expect(201);
  });

  it('a completed reset invalidates every other reset link of the account', async () => {
    const user = await registerVerified(t);
    const first = await requestReset(user.email);
    const second = await requestReset(user.email);
    expect(second).not.toBe(first);

    await t.http.post(`${API}/auth/reset-password`).send({ token: second, newPassword: NEW_PASSWORD }).expect(200);
    await t.http
      .post(`${API}/auth/reset-password`)
      .send({ token: first, newPassword: `${NEW_PASSWORD}-other` })
      .expect(400);
    await t.http.post(`${API}/auth/login`).send({ email: user.email, password: NEW_PASSWORD }).expect(201);
  });

  it('the per-account mail cap holds under simultaneous requests', async () => {
    const user = await registerVerified(t);
    await Promise.all(
      Array.from({ length: 12 }, () => t.http.post(`${API}/auth/forgot-password`).send({ email: user.email })),
    );
    await mailDone();
    const resetMails = t.mailbox.to(user.email).filter((m) => m.body.includes('reset-password'));
    expect(resetMails).toHaveLength(3);
  });

  it('answers without waiting for mail delivery (response time does not reveal the account)', async () => {
    const user = await registerVerified(t);
    t.mailbox.delayMs = 1_500;
    try {
      const started = Date.now();
      await t.http.post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
      expect(Date.now() - started).toBeLessThan(1_000);
      await t.mailbox.tokenFor(user.email, 'reset');
    } finally {
      t.mailbox.delayMs = 0;
    }
  });

  it('caps reset mails per account so the endpoint cannot be used to flood an inbox', async () => {
    const user = await registerVerified(t);
    for (let i = 0; i < 6; i += 1) {
      await t.http.post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
    }
    await mailDone();
    const resetMails = t.mailbox.to(user.email).filter((m) => m.body.includes('reset-password'));
    expect(resetMails).toHaveLength(3);
  });

  it('shutting down waits for every pending mail, including mail queued while it waits', async () => {
    const first = await registerVerified(t);
    const second = await registerVerified(t);
    await mailDone();
    t.mailbox.delayMs = 400;
    try {
      await t.http.post(`${API}/auth/forgot-password`).send({ email: first.email }).expect(200);
      while (t.mailbox.sending === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      // The first mail is on its way; the one queued next takes longer than it.
      t.mailbox.delayMs = 1_500;
      const draining = t.app.get(AuthService).onModuleDestroy();
      await t.http.post(`${API}/auth/forgot-password`).send({ email: second.email }).expect(200);
      await draining;
      expect(t.mailbox.to(second.email).filter((m) => m.body.includes('reset-password'))).toHaveLength(1);
    } finally {
      t.mailbox.delayMs = 0;
    }
  });

  it('caps verification re-sends per account', async () => {
    const email = uniqueEmail('pending');
    await t.http
      .post(`${API}/auth/register`)
      .send({ email, password: DEFAULT_PASSWORD, roles: [UserRole.DESIGNER] })
      .expect(201);
    for (let i = 0; i < 6; i += 1) {
      await t.http.post(`${API}/auth/resend-verify`).send({ email }).expect(200);
    }
    await mailDone();
    const verifyMails = t.mailbox.to(email).filter((m) => m.body.includes('verify-email'));
    expect(verifyMails).toHaveLength(3);
  });
});

describe('auth mail endpoints are throttled per client', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { AUTH_MAIL_THROTTLE_LIMIT: '10' } });
  });

  afterAll(async () => {
    await t.close();
  });

  it('forgot-password returns 429 after the per-client budget', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await t.http.post(`${API}/auth/forgot-password`).send({ email: uniqueEmail('x') });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.indexOf(429)).toBeGreaterThan(0);
  });
});

/**
 * Regression: issuing a mail token read its time-to-live through a second database connection while
 * the transaction holding the account lock kept the first: on a small or busy pool, every mail
 * request stalled until the pool timed out, then silently used the default lifetime.
 */
describe('mail tokens on a small connection pool', () => {
  it('a reset mail is issued even when the pool has a single connection', async () => {
    const t = await createTestApp();
    const user = await registerVerified(t);
    const url = new URL(process.env.DATABASE_URL as string);
    url.searchParams.set('connection_limit', '1');
    // Long enough that waiting for a second connection shows up as a missed deadline below.
    url.searchParams.set('pool_timeout', '15');
    const single = await createTestApp({ env: { DATABASE_URL: url.toString(), JOBS_ENABLED: 'false' } });
    try {
      await single.http.post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
      // Promptly: not after the pool timeout, with the configured lifetime quietly ignored.
      await single.mailbox.tokenFor(user.email, 'reset', 5_000);
    } finally {
      await single.close();
      await t.close();
    }
  });
});
