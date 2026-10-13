import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedDesign,
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  openConversation,
  registerVerified,
  TestJeweler,
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

  async function customerOf(jeweler: TestJeweler) {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const conversation = await openConversation(t, jeweler, design.id, [designer.id]);
    const quote = await createQuote(t, jeweler, conversation.id, design.id);
    await acceptQuote(t, designer, quote).expect(201);
    return designer;
  }

  it('two customers reviewing the same jeweler at the same moment both succeed', async () => {
    const jeweler = await createPublishedJeweler(t);
    const first = await customerOf(jeweler);
    const second = await customerOf(jeweler);

    // Both requests reach the profile row at once, the interleaving that used to deadlock.
    const lock = await lockRow(t, 'jeweler_profiles', jeweler.profileId);
    const posting = [
      t.http.post(`${API}/reviews`).set(first.auth).send(review(jeweler.profileId, 5)).then((r) => r),
      t.http.post(`${API}/reviews`).set(second.auth).send(review(jeweler.profileId, 3)).then((r) => r),
    ];
    await waitForLockWaiters(t, 2);
    await lock.release();

    const results = await Promise.all(posting);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const profile = await t.prisma.jewelerProfile.findUniqueOrThrow({ where: { id: jeweler.profileId } });
    expect(profile.reviewCount).toBe(2);
    expect(profile.ratingAvg.toString()).toBe('4');
  });

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

  it("the jeweler manages their profile's reviews even while it is not published", async () => {
    const jeweler = await createPublishedJeweler(t);
    const review = await t.prisma.review.create({
      data: { jewelerProfileId: jeweler.profileId, reviewerName: 'Dana', rating: 5, comment: 'Lovely' },
    });
    await t.prisma.jewelerProfile.update({ where: { id: jeweler.profileId }, data: { publishStatus: 'UNPUBLISHED' } });

    const mine = await t.http.get(`${API}/reviews/mine`).set(jeweler.auth).expect(200);
    expect((mine.body.data.items as Array<{ id: string }>).map((r) => r.id)).toEqual([review.id]);
    const shown = await t.http.get(`${API}/reviews`).query({ jewelerProfileId: jeweler.profileId }).expect(200);
    expect(shown.body.data.items).toEqual([]);
  });

  it('an account without a jeweler profile has no reviews to manage', async () => {
    const designer = await registerVerified(t);
    const mine = await t.http.get(`${API}/reviews/mine`).set(designer.auth).expect(200);
    expect(mine.body.data.items).toEqual([]);
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
