import { API, createTestApp, TestApp } from '../utils/test-app';
import { createDraftDesign, createPublishedJeweler, marketplaceScenario, registerVerified } from '../utils/factories';

const HUGE = 'x'.repeat(20_000);

/**
 * Regression: free-text fields were bounded only by the 1 MB body limit, so a single request could
 * store megabytes in a chat message, a profile or a design, and search terms of any length reached
 * the database.
 */
describe('input size limits', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  function expectFieldError(res: { status: number; body: { errors?: Array<{ field: string }> } }, field: string) {
    expect(res.status).toBe(400);
    expect((res.body.errors ?? []).map((e) => e.field)).toContain(field);
  }

  it('chat messages', async () => {
    const s = await marketplaceScenario(t);
    const res = await t.http
      .post(`${API}/conversations/${s.conversation.id}/messages`)
      .set(s.jeweler.auth)
      .send({ type: 'TEXT', body: HUGE });
    expectFieldError(res, 'body');
  });

  it('design texts', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const res = await t.http.patch(`${API}/designs/${design.id}`).set(owner.auth).send({ version: 1, description: HUGE });
    expectFieldError(res, 'description');
  });

  it('profile names', async () => {
    const user = await registerVerified(t);
    const res = await t.http.patch(`${API}/users/me`).set(user.auth).send({ firstName: HUGE });
    expectFieldError(res, 'firstName');
  });

  it('jeweler business texts', async () => {
    const jeweler = await createPublishedJeweler(t);
    const res = await t.http
      .post(`${API}/jeweler-profiles/me/portfolio`)
      .set(jeweler.auth)
      .send({ uploadId: '00000000-0000-4000-8000-000000000000', title: HUGE });
    expectFieldError(res, 'title');
  });

  it('search terms', async () => {
    const res = await t.http.get(`${API}/atelier/designs`).query({ q: HUGE.slice(0, 5_000) });
    expectFieldError(res, 'q');
  });
});
