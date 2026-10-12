import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  registerVerified,
} from '../utils/factories';

/**
 * Regression: anyone could post unlimited reviews (with any reviewer name) for any jeweler,
 * including their own profile, and the rating drives marketplace ranking.
 */
describe('reviews', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function completedDeal() {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);
    return s;
  }

  function review(jewelerProfileId: string, rating = 5) {
    return { jewelerProfileId, reviewerName: 'Dana', rating, comment: 'Beautiful work' };
  }

  it('a user without a completed deal with the jeweler cannot review', async () => {
    const jeweler = await createPublishedJeweler(t);
    const stranger = await registerVerified(t);
    const res = await t.http.post(`${API}/reviews`).set(stranger.auth).send(review(jeweler.profileId)).expect(403);
    expect(res.body.code).toBe('REVIEW_NOT_ELIGIBLE');
  });

  it('a jeweler cannot review their own profile', async () => {
    const jeweler = await createPublishedJeweler(t);
    await t.http.post(`${API}/reviews`).set(jeweler.auth).send(review(jeweler.profileId)).expect(403);
  });

  it('the designer of a completed deal can review exactly once', async () => {
    const { designer, jeweler } = await completedDeal();
    await t.http.post(`${API}/reviews`).set(designer.auth).send(review(jeweler.profileId, 4)).expect(201);
    const again = await t.http.post(`${API}/reviews`).set(designer.auth).send(review(jeweler.profileId, 1)).expect(409);
    expect(again.body.code).toBe('REVIEW_EXISTS');

    const profile = await t.prisma.jewelerProfile.findUniqueOrThrow({ where: { id: jeweler.profileId } });
    expect(profile.reviewCount).toBe(1);
    expect(profile.ratingAvg.toString()).toBe('4');
  });

  it('simultaneous reviews by the same author store one review', async () => {
    const { designer, jeweler } = await completedDeal();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => t.http.post(`${API}/reviews`).set(designer.auth).send(review(jeweler.profileId))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await t.prisma.review.count({ where: { jewelerProfileId: jeweler.profileId } })).toBe(1);
  });

  it('limits the length of reviewer names and comments', async () => {
    const { designer, jeweler } = await completedDeal();
    await t.http
      .post(`${API}/reviews`)
      .set(designer.auth)
      .send({ ...review(jeweler.profileId), reviewerName: 'x'.repeat(61) })
      .expect(400);
    await t.http
      .post(`${API}/reviews`)
      .set(designer.auth)
      .send({ ...review(jeweler.profileId), comment: 'x'.repeat(2001) })
      .expect(400);
  });
});
