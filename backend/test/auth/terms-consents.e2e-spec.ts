import { API, createTestApp, TestApp } from '../utils/test-app';
import { DEFAULT_PASSWORD, registerVerified, uniqueEmail } from '../utils/factories';

const AGENT = 'MalinvoskyApp/1.0 (iPhone; iOS 18.0)';

/**
 * The terms of use and privacy policy (click-wrap): the published terms with their version, and
 * a record, for every new account, of the version accepted, when, from where, and the separate
 * choice about marketing messages (Israel's anti-spam law asks for that consent on its own).
 */
describe('terms of use and consents', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const register = (body: Record<string, unknown>) =>
    t.http
      .post(`${API}/auth/register`)
      .set('User-Agent', AGENT)
      .send({ email: uniqueEmail('consent'), password: DEFAULT_PASSWORD, firstName: 'דנה', roles: ['DESIGNER'], ...body });

  const consentsOf = (email: string) =>
    t.prisma.userConsent.findMany({ where: { user: { email } }, orderBy: { kind: 'asc' } });

  describe('the published terms', () => {
    it('are served with their version: both parts, the clause on jewelers and the privacy contact', async () => {
      const res = await t.http.get(`${API}/content/tos`).expect(200);
      expect(res.body.data).toMatchObject({ slug: 'tos', locale: 'he', version: 1, status: 'PUBLISHED' });
      const blocks: Array<{ type: string; text: string; id?: string }> = res.body.data.body.blocks;
      expect(blocks[0]).toEqual({ type: 'heading', text: 'תקנון שימוש ומדיניות פרטיות – אפליקציית עיצוב תכשיטים' });
      expect(blocks.find((block) => block.id === 'privacy')).toMatchObject({ type: 'section', text: "חלק ב': מדיניות פרטיות והגנת המידע" });
      const items = blocks.map((block) => block.text);
      // 5.4 follows 5.3.
      expect(items.findIndex((text) => text.startsWith('5.4.'))).toBe(items.findIndex((text) => text.startsWith('5.3.')) + 1);
      expect(items.some((text) => text.includes('litvak_tzilla@hotmail.com'))).toBe(true);
      expect(items.some((text) => text.includes('your-app-email') || text.includes('הערת מפתח'))).toBe(false);
    });

    it('another language gets the Hebrew terms (the binding text); other pages keep their own language', async () => {
      const res = await t.http.get(`${API}/content/tos`).query({ locale: 'en' }).expect(200);
      expect(res.body.data).toMatchObject({ slug: 'tos', locale: 'he', version: 1 });
      // The app shows its own English text for these, not the Hebrew page.
      await t.http.get(`${API}/content/quote_disclaimer`).query({ locale: 'en' }).expect(404);
      await t.http.get(`${API}/content/no-such-page`).query({ locale: 'en' }).expect(404);
    });
  });

  describe('signing up', () => {
    it('records the terms accepted (version, time, address, device) and the marketing choice', async () => {
      const yes = await register({ acceptTerms: true, termsVersion: 1, marketingConsent: true }).expect(201);
      const email = yes.body.data.user.email;
      const [marketing, terms] = await consentsOf(email);
      expect(terms).toMatchObject({ kind: 'TERMS', granted: true, documentVersion: 1, source: 'signup', userAgent: AGENT });
      expect(terms.ip).toBeTruthy();
      expect(Math.abs(terms.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
      expect(marketing).toMatchObject({ kind: 'MARKETING', granted: true, source: 'signup' });
      const prefs = await t.prisma.userPreference.findFirstOrThrow({ where: { user: { email } } });
      expect(prefs.notifyMarketingEnabled).toBe(true);

      // Marketing is a separate choice, off unless chosen.
      const no = await register({ acceptTerms: true, termsVersion: 1 }).expect(201);
      const [noMarketing] = await consentsOf(no.body.data.user.email);
      expect(noMarketing).toMatchObject({ kind: 'MARKETING', granted: false });
    });

    it('refuses an account whose terms were declined, and creates nothing', async () => {
      const email = uniqueEmail('declined');
      const res = await register({ email, acceptTerms: false }).expect(400);
      expect(res.body.code).toBe('TERMS_REQUIRED');
      expect(await t.prisma.user.count({ where: { email } })).toBe(0);
    });

    it('records the version on show: a version never published counts as the current one', async () => {
      const res = await register({ acceptTerms: true, termsVersion: 99 }).expect(201);
      const terms = (await consentsOf(res.body.data.user.email)).find((row) => row.kind === 'TERMS');
      expect(terms?.documentVersion).toBe(1);
    });

    it('an older app, which required the box but does not send it, is recorded as such', async () => {
      const res = await register({}).expect(201);
      const terms = (await consentsOf(res.body.data.user.email)).find((row) => row.kind === 'TERMS');
      expect(terms).toMatchObject({ granted: true, documentVersion: 1, source: 'signup_older_app' });
    });
  });

  describe('marketing messages later', () => {
    it('turning them on or off in the preferences is recorded, each change once', async () => {
      const user = await registerVerified(t);
      const before = await t.prisma.userConsent.count({ where: { userId: user.id, kind: 'MARKETING' } });
      await t.http.patch(`${API}/users/me/preferences`).set(user.auth).send({ notifyMarketingEnabled: true }).expect(200);
      await t.http.patch(`${API}/users/me/preferences`).set(user.auth).send({ notifyMarketingEnabled: true }).expect(200);
      await t.http.patch(`${API}/users/me/preferences`).set(user.auth).send({ notifyMarketingEnabled: false }).expect(200);
      await t.http.patch(`${API}/users/me/preferences`).set(user.auth).send({ notifyPushEnabled: false }).expect(200);
      const rows = await t.prisma.userConsent.findMany({ where: { userId: user.id, kind: 'MARKETING' }, orderBy: { createdAt: 'asc' } });
      expect(rows.slice(before).map((row) => [row.granted, row.source])).toEqual([
        [true, 'preferences'],
        [false, 'preferences'],
      ]);
    });
  });
});
