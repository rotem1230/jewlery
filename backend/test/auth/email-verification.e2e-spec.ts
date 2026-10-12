import { UserRole } from '@prisma/client';
import { TokenService } from '../../src/auth/services/token.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { bearer, DEFAULT_PASSWORD, uniqueEmail } from '../utils/factories';

/**
 * Regression: an account that never proved ownership of its e-mail must not be able to use the
 * platform (finding: register handed out tokens and the JWT strategy accepted
 * PENDING_VERIFICATION users, so anyone could operate under someone else's address).
 */
describe('e-mail verification is enforced', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function registerPending() {
    const email = uniqueEmail('pending');
    const res = await t.http
      .post(`${API}/auth/register`)
      .send({ email, password: DEFAULT_PASSWORD, roles: [UserRole.DESIGNER] })
      .expect(201);
    return { email, res };
  }

  /** Simulates a token held by an unverified account (e.g. issued before this fix). */
  async function tokensForPending(email: string) {
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    const { passwordHash: _ignored, ...safe } = user;
    return t.app.get(TokenService).issueTokens(safe);
  }

  it('register does not hand out session tokens', async () => {
    const { res } = await registerPending();
    expect(res.body.data.tokens).toBeUndefined();
    expect(res.body.data.user.status).toBe('PENDING_VERIFICATION');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('refuses an unverified account on protected routes', async () => {
    const { email } = await registerPending();
    const tokens = await tokensForPending(email);
    const res = await t.http.get(`${API}/designs`).set(bearer(tokens.accessToken)).expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('refuses mutating routes for an unverified account', async () => {
    const { email } = await registerPending();
    const tokens = await tokensForPending(email);
    const res = await t.http
      .post(`${API}/ai/inspiration`)
      .set(bearer(tokens.accessToken))
      .send({ prompt: 'gold ring' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('still lets an unverified account read its own profile', async () => {
    const { email } = await registerPending();
    const tokens = await tokensForPending(email);
    const res = await t.http.get(`${API}/auth/me`).set(bearer(tokens.accessToken)).expect(200);
    expect(res.body.data.email).toBe(email);
  });

  it('refuses to refresh a session of an unverified account', async () => {
    const { email } = await registerPending();
    const tokens = await tokensForPending(email);
    await t.http
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('grants access once the e-mail is verified', async () => {
    const { email } = await registerPending();
    const token = await t.mailbox.tokenFor(email, 'verify');
    await t.http.post(`${API}/auth/verify-email`).send({ token }).expect(200);
    const login = await t.http
      .post(`${API}/auth/login`)
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(201);
    await t.http.get(`${API}/designs`).set(bearer(login.body.data.tokens.accessToken)).expect(200);
  });

  it('a verification token works only once under concurrent use', async () => {
    const { email } = await registerPending();
    const token = await t.mailbox.tokenFor(email, 'verify');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => t.http.post(`${API}/auth/verify-email`).send({ token })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(4);
  });
});
