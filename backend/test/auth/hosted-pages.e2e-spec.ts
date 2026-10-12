import { UserRole } from '@prisma/client';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { DEFAULT_PASSWORD, registerVerified, uniqueEmail } from '../utils/factories';

/**
 * Regression: verification / reset e-mails linked to APP_URL pages that did not exist, so in
 * production nobody could verify an address or reset a password. The API now hosts minimal,
 * locked-down pages; GET never consumes a token (mail scanners prefetch links).
 */
describe('hosted e-mail link pages', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function registerPending() {
    const email = uniqueEmail('web');
    await t.http
      .post(`${API}/auth/register`)
      .send({ email, password: DEFAULT_PASSWORD, roles: [UserRole.DESIGNER] })
      .expect(201);
    return { email, token: await t.mailbox.tokenFor(email, 'verify') };
  }

  it('mails links to the hosted pages on the public API URL', async () => {
    const { email } = await registerPending();
    const mail = t.mailbox.to(email)[0];
    expect(mail.body).toContain('http://localhost:3000/api/v1/auth/web/verify-email?token=');
  });

  it('opening the verification link does not consume the token', async () => {
    const { email, token } = await registerPending();
    const page = await t.http.get(`${API}/auth/web/verify-email`).query({ token }).expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('<form');

    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('PENDING_VERIFICATION');
  });

  it('submitting the verification page verifies the account', async () => {
    const { email, token } = await registerPending();
    await t.http.post(`${API}/auth/web/verify-email`).type('form').send({ token }).expect(200);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('ACTIVE');
    await t.http.post(`${API}/auth/login`).send({ email, password: DEFAULT_PASSWORD }).expect(201);
  });

  it('a malformed link renders an error page without echoing the input', async () => {
    const res = await t.http
      .get(`${API}/auth/web/verify-email`)
      .query({ token: '"><script>alert(1)</script>' })
      .expect(400);
    expect(res.text).not.toContain('<script>alert(1)</script>');
  });

  it('the reset page sets a new password on submit', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
    const token = await t.mailbox.tokenFor(user.email, 'reset');

    await t.http.get(`${API}/auth/web/reset-password`).query({ token }).expect(200);
    await t.http
      .post(`${API}/auth/web/reset-password`)
      .type('form')
      .send({ token, newPassword: 'Hosted-Pass-123', confirmPassword: 'Hosted-Pass-123' })
      .expect(200);
    await t.http.post(`${API}/auth/login`).send({ email: user.email, password: 'Hosted-Pass-123' }).expect(201);
  });

  it('a mismatched confirmation does not consume the reset token', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
    const token = await t.mailbox.tokenFor(user.email, 'reset');

    await t.http
      .post(`${API}/auth/web/reset-password`)
      .type('form')
      .send({ token, newPassword: 'Hosted-Pass-123', confirmPassword: 'Different-Pass-1' })
      .expect(400);
    await t.http
      .post(`${API}/auth/web/reset-password`)
      .type('form')
      .send({ token, newPassword: 'Hosted-Pass-123', confirmPassword: 'Hosted-Pass-123' })
      .expect(200);
  });

  it('serves the pages with strict security headers', async () => {
    const { token } = await registerPending();
    const res = await t.http.get(`${API}/auth/web/verify-email`).query({ token }).expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toContain('no-store');
  });
});
