import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified } from '../utils/factories';

/**
 * Regression: a malformed id reached Prisma on routes without a UUID pipe and surfaced as an
 * opaque 500 (and an error log entry per request), instead of a plain "not found".
 */
describe('malformed identifiers', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it.each([
    'designs/not-a-uuid',
    'quotes/not-a-uuid',
    'conversations/not-a-uuid/messages',
    'atelier/requests/not-a-uuid',
    'jewelry-payments/not-a-uuid',
    'jeweler-profiles/not-a-uuid',
  ])('GET /%s answers 404', async (path) => {
    const user = await registerVerified(t);
    const res = await t.http.get(`${API}/${path}`).set(user.auth);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
