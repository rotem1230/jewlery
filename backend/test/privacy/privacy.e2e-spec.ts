import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  createPublishedDesign,
  createPublishedJeweler,
  DEFAULT_PASSWORD,
  registerVerified,
} from '../utils/factories';

/**
 * Regressions: GET /users/:id disclosed every user's e-mail, public endpoints returned whole DB
 * rows (internal ids, reviewer ids, raw upload rows, precise coordinates), and deleted accounts
 * stayed visible in the marketplace while their e-mail could never be reused.
 */
describe('public data exposure', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('a public user profile does not disclose e-mail or account status', async () => {
    const target = await registerVerified(t);
    const viewer = await registerVerified(t);
    const res = await t.http.get(`${API}/users/${target.id}`).set(viewer.auth).expect(200);
    expect(res.body.data.id).toBe(target.id);
    expect(res.body.data.email).toBeUndefined();
    expect(res.body.data.status).toBeUndefined();
  });

  it('the public design feed carries no internal or reviewer fields', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const res = await t.http.get(`${API}/atelier/designs`).query({ q: '' }).expect(200);
    const item = (res.body.data.items as Array<Record<string, unknown>>).find((i) => i.id === design.id);
    expect(item).toBeDefined();
    for (const field of [
      'feasibilityReviewerId',
      'feasibilityStatus',
      'completedByJewelerId',
      'acceptedQuoteId',
      'lockedFields',
      'version',
      'deletedAt',
    ]) {
      expect(item).not.toHaveProperty(field);
    }
    expect(item).toHaveProperty('ownerUserId', designer.id);
  });

  it('a public jeweler profile hides raw upload rows and precise coordinates', async () => {
    const jeweler = await registerVerified(t, { roles: ['JEWELER'] });
    const regions = await t.http.get(`${API}/master-data/regions`).expect(200);
    await t.http
      .put(`${API}/jeweler-profiles/draft`)
      .set(jeweler.auth)
      .send({
        regionId: regions.body.data[0].id,
        payload: { businessName: 'Geo Atelier', phone: '+972501234567', latitude: 32.085312, longitude: 34.781768 },
      })
      .expect(200);
    const published = await t.http.post(`${API}/jeweler-profiles/publish`).set(jeweler.auth).send({}).expect(201);

    const res = await t.http.get(`${API}/jeweler-profiles/${published.body.data.id}`).expect(200);
    // The app reads logoUpload.id; storage location and owner must never be exposed.
    expect(res.body.data.logoUpload?.objectKey).toBeUndefined();
    expect(res.body.data.logoUpload?.ownerUserId).toBeUndefined();
    expect(res.body.data.logoUpload?.bucket).toBeUndefined();
    expect(Number(res.body.data.latitude)).toBeCloseTo(32.09, 2);
    expect(String(res.body.data.latitude)).not.toContain('085312');

    const list = await t.http.get(`${API}/atelier/jewelers`).query({ q: 'Geo Atelier' }).expect(200);
    const row = (list.body.data.items as Array<Record<string, unknown>>).find((i) => i.id === published.body.data.id);
    expect(String(row?.longitude)).not.toContain('781768');

    // Contact details are shared through the post-acceptance handoff, not scraped from listings.
    for (const view of [res.body.data, row]) {
      expect(view).toBeDefined();
      for (const field of ['phone', 'email', 'publishStatus']) {
        expect(view).not.toHaveProperty(field);
      }
      expect(view).toHaveProperty('businessName', 'Geo Atelier');
    }
  });

  it('geo search cannot locate a workshop more precisely than its published (rounded) location', async () => {
    await t.prisma.featureFlag.upsert({
      where: { key: 'phase3_postgis' },
      update: { enabled: true, rolloutPct: 100 },
      create: { key: 'phase3_postgis', enabled: true, rolloutPct: 100 },
    });
    // Two workshops whose exact coordinates differ but round to the same published point.
    const a = await createPublishedJeweler(t, { latitude: -45.0812, longitude: 170.7812 });
    const b = await createPublishedJeweler(t, { latitude: -45.0838, longitude: 170.7838 });
    const found = async (lat: number, lng: number, radiusKm: number) => {
      const res = await t.http.get(`${API}/atelier/geo/search`).query({ lat, lng, radiusKm }).expect(200);
      return (res.body.data.items as Array<{ id: string }>)
        .map((item) => item.id)
        .filter((id) => id === a.profileId || id === b.profileId)
        .sort();
    };

    // A tiny radius around either exact spot must not tell the two apart.
    const nearA = await found(-45.0812, 170.7812, 0.05);
    const nearB = await found(-45.0838, 170.7838, 0.05);
    expect(nearA).toEqual(nearB);
    expect(nearA).toEqual([a.profileId, b.profileId].sort());
  });

  it('public reviews do not expose author user ids', async () => {
    const jeweler = await createPublishedJeweler(t);
    await t.prisma.review.create({
      data: { jewelerProfileId: jeweler.profileId, authorUserId: jeweler.id, reviewerName: 'A', rating: 5, comment: 'c' },
    });
    const res = await t.http.get(`${API}/reviews`).query({ jewelerProfileId: jeweler.profileId }).expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0]).not.toHaveProperty('authorUserId');
  });
});

describe('account deletion', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('removes a deleted designer\'s designs from the marketplace', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    await t.http.delete(`${API}/users/me`).set(designer.auth).expect(200);

    const res = await t.http.get(`${API}/atelier/designs`).expect(200);
    expect((res.body.data.items as Array<{ id: string }>).some((i) => i.id === design.id)).toBe(false);
  });

  it('unpublishes a deleted jeweler\'s profile', async () => {
    const jeweler = await createPublishedJeweler(t);
    await t.http.delete(`${API}/users/me`).set(jeweler.auth).expect(200);
    await t.http.get(`${API}/jeweler-profiles/${jeweler.profileId}`).expect(404);
  });

  it('anonymizes personal data and frees the e-mail for a new account', async () => {
    const user = await registerVerified(t);
    await t.http.patch(`${API}/users/me`).set(user.auth).send({ phone: '+972500000000' }).expect(200);
    await t.http.delete(`${API}/users/me`).set(user.auth).expect(200);

    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.email).not.toBe(user.email);
    expect(row.phone).toBeNull();
    expect(row.firstName).toBeNull();
    expect(row.passwordHash).toBeNull();

    await t.http
      .post(`${API}/auth/register`)
      .send({ email: user.email, password: DEFAULT_PASSWORD, roles: ['DESIGNER'] })
      .expect(201);
  });

  it('revokes every session of the deleted account', async () => {
    const user = await registerVerified(t);
    await t.http.delete(`${API}/users/me`).set(user.auth).expect(200);
    await t.http.post(`${API}/auth/refresh`).send({ refreshToken: user.refreshToken }).expect(401);
    await t.http.get(`${API}/designs`).set(user.auth).expect(401);
  });
});
