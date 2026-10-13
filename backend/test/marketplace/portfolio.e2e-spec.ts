import { API, createTestApp, TestApp } from '../utils/test-app';
import { PNG_BYTES, uploadFile } from '../utils/files';
import { createPublishedJeweler, TestJeweler } from '../utils/factories';

/**
 * Regression: publishing the business profile from the app re-posted every picture already in
 * the portfolio, and the API added each one again: the gallery filled with duplicates.
 */
describe('jeweler portfolio', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function picture(jeweler: TestJeweler, name = 'work.png'): Promise<string> {
    const res = await uploadFile(t, jeweler, PNG_BYTES, 'image/png', name).expect(201);
    return res.body.data.id as string;
  }

  function add(jeweler: TestJeweler, uploadId: string, extra: Record<string, unknown> = {}) {
    return t.http.post(`${API}/jeweler-profiles/me/portfolio`).set(jeweler.auth).send({ uploadId, ...extra });
  }

  it('adding a picture that is already in the portfolio returns the existing item', async () => {
    const jeweler = await createPublishedJeweler(t);
    const uploadId = await picture(jeweler);
    const first = await add(jeweler, uploadId, { sortOrder: 0 }).expect(201);
    const again = await add(jeweler, uploadId, { sortOrder: 3 }).expect(201);

    expect(again.body.data.id).toBe(first.body.data.id);
    expect(await t.prisma.portfolioItem.count({ where: { profileId: jeweler.profileId } })).toBe(1);
  });

  it('two simultaneous adds of one picture keep a single item', async () => {
    const jeweler = await createPublishedJeweler(t);
    const uploadId = await picture(jeweler);
    const [a, b] = await Promise.all([add(jeweler, uploadId), add(jeweler, uploadId)]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await t.prisma.portfolioItem.count({ where: { profileId: jeweler.profileId } })).toBe(1);
  });

  it('different pictures are all kept, in their order', async () => {
    const jeweler = await createPublishedJeweler(t);
    const first = await picture(jeweler, 'one.png');
    const second = await picture(jeweler, 'two.png');
    await add(jeweler, first, { sortOrder: 0 }).expect(201);
    await add(jeweler, second, { sortOrder: 1 }).expect(201);

    const list = await t.http.get(`${API}/jeweler-profiles/me/portfolio`).set(jeweler.auth).expect(200);
    expect((list.body.data as Array<{ uploadId: string }>).map((item) => item.uploadId)).toEqual([first, second]);
  });
});
