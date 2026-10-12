import { API, createTestApp, TestApp } from '../utils/test-app';
import { uniqueEmail } from '../utils/factories';

function forgot(t: TestApp, forwardedFor: string) {
  return t.http
    .post(`${API}/auth/forgot-password`)
    .set('X-Forwarded-For', forwardedFor)
    .send({ email: uniqueEmail('ip') });
}

/**
 * Regression: TRUST_PROXY was read but never applied. Behind a load balancer every request came
 * from the balancer's address, so one abusive client exhausted the per-client sign-in and mail
 * budgets for every user. Trusting X-Forwarded-For blindly would instead let a client pick its IP.
 */
describe('client address', () => {
  describe('without TRUST_PROXY (API exposed directly)', () => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp({ env: { AUTH_MAIL_THROTTLE_LIMIT: '2', TRUST_PROXY: undefined } });
    });

    afterAll(async () => {
      await t.close();
    });

    it('a forged X-Forwarded-For does not buy a fresh budget', async () => {
      await forgot(t, '198.51.100.1').expect(200);
      await forgot(t, '198.51.100.2').expect(200);
      await forgot(t, '198.51.100.3').expect(429);
    });
  });

  describe('with TRUST_PROXY=1 (one load balancer in front)', () => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp({ env: { AUTH_MAIL_THROTTLE_LIMIT: '2', TRUST_PROXY: '1' } });
    });

    afterAll(async () => {
      await t.close();
    });

    it('budgets belong to the real client, not to everyone behind the proxy', async () => {
      await forgot(t, '203.0.113.7').expect(200);
      await forgot(t, '203.0.113.7').expect(200);
      await forgot(t, '203.0.113.7').expect(429);
      await forgot(t, '203.0.113.8').expect(200);
    });

    it('only the hop added by the proxy counts; client-supplied entries are ignored', async () => {
      await forgot(t, '10.9.9.1, 203.0.113.20').expect(200);
      await forgot(t, '10.9.9.2, 203.0.113.20').expect(200);
      await forgot(t, '10.9.9.3, 203.0.113.20').expect(429);
    });
  });
});
