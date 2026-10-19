import { UserRole } from '@prisma/client';
import { AI_ENGINE_ADAPTER, AiGenerateResult } from '../../src/ai/adapters/ai-engine.adapter';
import { CardcomClient } from '../../src/common/payments/cardcom.client';
import { FakeCardcom } from '../utils/fake-cardcom';
import { PNG_BYTES, uploadFile } from '../utils/files';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

const PICTURE = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** The plans requirements of the pricing table: plans edited by an admin, costs, fair use, reports. */
describe('plans, costs and reports for the admin', () => {
  let t: TestApp;
  const cardcom = new FakeCardcom();
  const engine = {
    isConfigured: () => true,
    generate: async (): Promise<AiGenerateResult> => ({ image: PICTURE, mimeType: 'image/jpeg', providerRef: 'test' }),
  };

  beforeAll(async () => {
    t = await createTestApp({
      env: {
        PAYMENTS_PROVIDER: 'cardcom',
        CARDCOM_TERMINAL_NUMBER: '1000',
        CARDCOM_API_NAME: 'test-api',
        API_PUBLIC_URL: 'https://api.example.test',
        AI_IMAGE_COST_USD: '0.067',
        USD_TO_ILS: '3.7',
        CARD_FEE_PERCENT: '2',
      },
      configure: (b) => b.overrideProvider(CardcomClient).useValue(cardcom).overrideProvider(AI_ENGINE_ADAPTER).useValue(engine),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  async function admin(): Promise<TestUser> {
    const user = await registerVerified(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { roles: [UserRole.DESIGNER, UserRole.ADMIN] } });
    return user;
  }

  async function finished(user: TestUser, id: string) {
    for (let i = 0; i < 100; i++) {
      const res = await t.http.get(`${API}/ai/jobs/${id}`).set(user.auth).expect(200);
      if (!['QUEUED', 'RUNNING'].includes(res.body.data.status)) return res.body.data;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('AI job never finished');
  }

  const generate = (user: TestUser, prompt = 'טבעת') => t.http.post(`${API}/ai/inspiration`).set(user.auth).send({ prompt });

  describe('editing plans', () => {
    it('lists every plan with its price, cycle, quotas, features and live subscribers', async () => {
      const boss = await admin();
      const res = await t.http.get(`${API}/admin/plans`).set(boss.auth).expect(200);
      const quarterly = res.body.data.find((plan: { code: string }) => plan.code === 'DESIGNER_PREMIUM_QUARTERLY');
      expect(quarterly).toMatchObject({
        role: 'DESIGNER',
        nameHe: 'מעצב/ת - פרימיום רבעוני',
        billingCycle: 'QUARTERLY',
        price: 45,
        trialDays: 14,
        aiRenders: 150,
        unlimited: false,
        isActive: true,
        features: expect.arrayContaining(['no_watermark', 'hd_export', 'personal_visualization', 'verified_designer_badge']),
      });
      expect(typeof quarterly.liveSubscribers).toBe('number');
      expect(res.body.data.find((plan: { code: string }) => plan.code === 'JEWELER_UNLIMITED')).toMatchObject({ leadQuota: 40, unlimited: true });
      const features = await t.http.get(`${API}/admin/plans/features`).set(boss.auth).expect(200);
      expect(features.body.data.map((feature: { key: string }) => feature.key)).toEqual(expect.arrayContaining(['hd_export', 'warm_leads']));
    });

    it('a price, quota or feature change applies to new subscribers and to the quota at once; existing subscriptions keep their price', async () => {
      const boss = await admin();
      const subscriber = await registerVerified(t);
      await t.http.post(`${API}/subscriptions/subscribe`).set(subscriber.auth).send({ planCode: 'DESIGNER_PREMIUM_ANNUAL' }).expect(201);
      try {
        const res = await t.http
          .patch(`${API}/admin/plans/DESIGNER_PREMIUM_ANNUAL`)
          .set(boss.auth)
          .send({ price: 169, aiRenders: 1, features: ['no_watermark', 'hd_export'], bulletsHe: ['מבצע השקה'] })
          .expect(200);
        expect(res.body.data).toMatchObject({ price: 169, aiRenders: 1, features: ['hd_export', 'no_watermark'] });

        const listed = await t.http.get(`${API}/subscriptions/plans`).set(subscriber.auth).query({ role: 'DESIGNER' }).expect(200);
        const annual = listed.body.data.find((plan: { code: string }) => plan.code === 'DESIGNER_PREMIUM_ANNUAL');
        expect(Number(annual.price)).toBe(169);
        expect(annual.inclusions.bullets).toEqual(['מבצע השקה']);
        const sub = await t.prisma.subscription.findFirstOrThrow({ where: { userId: subscriber.id } });
        expect(Number(sub.price)).toBe(149);

        const first = await generate(subscriber).expect(202);
        await finished(subscriber, first.body.data.id);
        expect((await generate(subscriber).expect(429)).body.code).toBe('AI_PLAN_QUOTA_EXCEEDED');
      } finally {
        await t.http
          .patch(`${API}/admin/plans/DESIGNER_PREMIUM_ANNUAL`)
          .set(boss.auth)
          .send({ price: 149, aiRenders: 600, features: ['no_watermark', 'hd_export', 'personal_visualization', 'verified_designer_badge'], bulletsHe: ['כל יכולות הפרימיום, בחיוב שנתי'] })
          .expect(200);
      }
    });

    it('a new plan can be created, and a plan withdrawn from the offer', async () => {
      const boss = await admin();
      const code = `DESIGNER_TEST_${Date.now()}`;
      const created = await t.http
        .post(`${API}/admin/plans`)
        .set(boss.auth)
        .send({ code, role: 'DESIGNER', nameHe: 'מסלול בדיקה', billingCycle: 'MONTHLY', price: 19.9, trialDays: 0, leadQuota: 0, aiRenders: 30, features: ['hd_export'] })
        .expect(201);
      expect(created.body.data).toMatchObject({ code, price: 19.9, aiRenders: 30, isActive: true });
      const offered = async () =>
        (await t.http.get(`${API}/subscriptions/plans`).set(boss.auth).query({ role: 'DESIGNER' }).expect(200)).body.data.map((plan: { code: string }) => plan.code);
      expect(await offered()).toContain(code);
      expect((await t.http.post(`${API}/admin/plans`).set(boss.auth).send({ code, role: 'DESIGNER', nameHe: 'x', billingCycle: 'MONTHLY', price: 1 }).expect(409)).body.code).toBe(
        'PLAN_EXISTS',
      );
      await t.http.patch(`${API}/admin/plans/${code}`).set(boss.auth).send({ isActive: false }).expect(200);
      expect(await offered()).not.toContain(code);
    });

    it('refuses invalid plans and non-admins', async () => {
      const boss = await admin();
      await t.http.post(`${API}/admin/plans`).set(boss.auth).send({ code: 'bad code', role: 'DESIGNER', nameHe: 'x', billingCycle: 'MONTHLY', price: 1 }).expect(400);
      await t.http.patch(`${API}/admin/plans/DESIGNER_FREE`).set(boss.auth).send({ price: -5 }).expect(400);
      await t.http.patch(`${API}/admin/plans/DESIGNER_FREE`).set(boss.auth).send({ features: ['no_such_feature'] }).expect(400);
      await t.http.patch(`${API}/admin/plans/NO_SUCH_PLAN`).set(boss.auth).send({ price: 5 }).expect(404);
      const user = await registerVerified(t);
      await t.http.get(`${API}/admin/plans`).set(user.auth).expect(403);
      await t.http.patch(`${API}/admin/plans/DESIGNER_FREE`).set(user.auth).send({ price: 5 }).expect(403);
    });
  });

  describe('costs and fair use', () => {
    it('each AI creation records what it cost', async () => {
      const user = await registerVerified(t);
      const job = await generate(user).expect(202);
      await finished(user, job.body.data.id);
      const row = await t.prisma.aiGenerationJob.findUniqueOrThrow({ where: { id: job.body.data.id } });
      expect(Number(row.costIls)).toBeCloseTo(0.2479, 4);
    });

    it("media downloads count as traffic of the files' owner", async () => {
      const user = await registerVerified(t);
      const upload = (await uploadFile(t, user, PNG_BYTES, 'image/png', 'a.png').expect(201)).body.data;
      await t.http.get(`${API}/uploads/${upload.id}/content`).set(user.auth).expect(200);
      await t.http.get(`${API}/uploads/${upload.id}/content`).set(user.auth).expect(200);
      // Recorded once the response is sent.
      let row = null;
      for (let i = 0; i < 50 && !row; i++) {
        row = await t.prisma.mediaTrafficDaily.findFirst({ where: { ownerUserId: user.id, requests: { gte: 2 } } });
        if (!row) await new Promise((r) => setTimeout(r, 20));
      }
      expect(row).not.toBeNull();
      expect(Number(row?.bytes)).toBe(PNG_BYTES.length * 2);
    });

    it('nearing the AI quota (80%) and reaching it raise one alert each for the period', async () => {
      const user = await registerVerified(t);
      await t.prisma.aiGenerationJob.createMany({
        data: Array.from({ length: 7 }, () => ({ requestedById: user.id, prompt: 'earlier', status: 'SUCCEEDED' as const, createdAt: new Date(Date.now() - 2 * DAY_MS) })),
      });
      const eighth = await generate(user).expect(202);
      await finished(user, eighth.body.data.id);
      const ninth = await generate(user).expect(202);
      await finished(user, ninth.body.data.id);
      const tenth = await generate(user).expect(202);
      await finished(user, tenth.body.data.id);
      await generate(user).expect(429);
      await generate(user).expect(429);
      const alerts = await t.prisma.usageAlert.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
      expect(alerts.map((alert) => alert.kind)).toEqual(['AI_QUOTA_80', 'AI_QUOTA_REACHED']);
    });

    it('reaching the daily limit raises an alert', async () => {
      const user = await registerVerified(t);
      await t.prisma.appConfig.upsert({
        where: { key: 'ai_limits' },
        update: { value: { dailyPerUser: 1 }, version: { increment: 1 } },
        create: { key: 'ai_limits', value: { dailyPerUser: 1 } },
      });
      try {
        const first = await generate(user).expect(202);
        await finished(user, first.body.data.id);
        expect((await generate(user).expect(429)).body.code).toBe('AI_QUOTA_EXCEEDED');
      } finally {
        await t.prisma.appConfig.delete({ where: { key: 'ai_limits' } });
      }
      expect(await t.prisma.usageAlert.count({ where: { userId: user.id, kind: 'AI_DAILY_LIMIT' } })).toBe(1);
    });
  });

  describe('reports', () => {
    /** A designer who paid the quarterly plan by card. */
    async function paying() {
      const user = await registerVerified(t);
      const started = (await t.http.post(`${API}/subscriptions/checkout`).set(user.auth).send({ planCode: 'DESIGNER_PREMIUM_QUARTERLY' }).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      cardcom.pay(session.providerRef as string);
      await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: session.providerRef }).expect(200);
      return user;
    }

    it('usage per user: AI creations and their cost, storage, traffic, revenue and alerts', async () => {
      const boss = await admin();
      const user = await paying();
      const job = await generate(user).expect(202);
      await finished(user, job.body.data.id);
      const upload = (await uploadFile(t, user, PNG_BYTES, 'image/png', 'b.png').expect(201)).body.data;
      await t.http.get(`${API}/uploads/${upload.id}/content`).set(user.auth).expect(200);
      await new Promise((r) => setTimeout(r, 100));

      const res = await t.http.get(`${API}/admin/reports/usage`).set(boss.auth).expect(200);
      const row = res.body.data.users.find((item: { user: { id: string } }) => item.user.id === user.id);
      expect(row).toMatchObject({
        plan: { code: 'DESIGNER_PREMIUM_QUARTERLY' },
        aiCreations: 1,
        revenue: 45,
      });
      // Money in the reports is in agorot.
      expect(row.aiCost).toBe(0.25);
      expect(row.storageBytes).toBeGreaterThanOrEqual(PNG_BYTES.length);
      expect(row.trafficBytes).toBeGreaterThanOrEqual(PNG_BYTES.length);
      expect(res.body.data.assumptions).toMatchObject({ aiImageCostIls: expect.any(Number), cardFeePercent: 2 });
    });

    it('revenue and expenses per plan: payments, refunds, card fees, costs and net; and the jewelry money', async () => {
      const boss = await admin();
      const user = await paying();
      const invoice = await t.prisma.subscriptionInvoice.findFirstOrThrow({ where: { subscription: { userId: user.id } } });
      await t.http.post(`${API}/admin/payments/invoices/${invoice.id}/refunds`).set(boss.auth).send({ amount: 5, reason: 'פיצוי' }).expect(201);

      const res = await t.http.get(`${API}/admin/reports/finance`).set(boss.auth).expect(200);
      const plan = res.body.data.plans.find((row: { code: string }) => row.code === 'DESIGNER_PREMIUM_QUARTERLY');
      expect(plan.payments).toBeGreaterThanOrEqual(1);
      expect(plan.revenue).toBeGreaterThanOrEqual(45);
      expect(plan.refunds).toBeGreaterThanOrEqual(5);
      expect(plan.cardFees).toBeCloseTo(plan.revenue * 0.02, 2);
      expect(plan.net).toBeCloseTo(plan.revenue - plan.refunds - plan.cardFees - plan.aiCost - plan.storageCost - plan.trafficCost, 2);
      expect(res.body.data.totals.revenue).toBeGreaterThanOrEqual(plan.revenue);
      expect(res.body.data.jewelry).toMatchObject({ payments: expect.any(Number), owedToJewelers: expect.any(Number), transferredToJewelers: expect.any(Number) });
    });

    it('payments kept for review are listed for the admin', async () => {
      const boss = await admin();
      const user = await registerVerified(t);
      const started = (await t.http.post(`${API}/subscriptions/checkout`).set(user.auth).send({ planCode: 'DESIGNER_PREMIUM_QUARTERLY' }).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      cardcom.pay(session.providerRef as string, { amount: 1 });
      await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: session.providerRef }).expect(200);
      const res = await t.http.get(`${API}/admin/payments/review`).set(boss.auth).expect(200);
      expect(res.body.data.find((item: { checkoutId: string }) => item.checkoutId === started.id)).toMatchObject({ outcome: 'NEEDS_REVIEW', amount: 1 });
    });

    it('reports are for admins only', async () => {
      const user = await registerVerified(t);
      await t.http.get(`${API}/admin/reports/usage`).set(user.auth).expect(403);
      await t.http.get(`${API}/admin/reports/finance`).set(user.auth).expect(403);
      await t.http.get(`${API}/admin/payments/review`).set(user.auth).expect(403);
    });
  });
});
