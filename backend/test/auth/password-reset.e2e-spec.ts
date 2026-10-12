import { UserRole } from '@prisma/client';
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

  async function requestReset(email: string): Promise<string> {
    const before = t.mailbox.to(email).length;
    await t.http.post(`${API}/auth/forgot-password`).send({ email }).expect(200);
    await t.mailbox.waitForMoreThan(email, before);
    return await t.mailbox.tokenFor(email, 'reset');
  }

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
    await t.mailbox.settle();
    const resetMails = t.mailbox.to(user.email).filter((m) => m.body.includes('reset-password'));
    expect(resetMails.length).toBeLessThanOrEqual(3);
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
    await t.mailbox.settle();
    const resetMails = t.mailbox.to(user.email).filter((m) => m.body.includes('reset-password'));
    expect(resetMails).toHaveLength(3);
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
    await t.mailbox.settle();
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
