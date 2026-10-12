import { randomUUID } from 'crypto';
import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createPublishedDesign,
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  registerVerified,
  TestJeweler,
  TestUser,
} from '../utils/factories';

const DAY_MS = 24 * 60 * 60 * 1000;

async function setLeadPolicy(t: TestApp, enforceQuota: boolean) {
  await t.prisma.appConfig.upsert({
    where: { key: 'lead_definition' },
    update: { value: { mode: 'design_request_delivery', enforceQuota }, version: { increment: 1 } },
    create: { key: 'lead_definition', value: { mode: 'design_request_delivery', enforceQuota } },
  });
}

async function requestQuote(t: TestApp, designer: TestUser, jeweler: TestJeweler, designId?: string) {
  const id = designId ?? (await createPublishedDesign(t, designer)).id;
  return t.http
    .post(`${API}/atelier/requests`)
    .set(designer.auth)
    .send({ designId: id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] });
}

/** Regression: lead quotas were dead code — consumeLeadForDelivery was never called. */
describe('lead metering on design-request delivery', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    await setLeadPolicy(t, false);
  });

  afterAll(async () => {
    await t.close();
  });

  async function subscribedJeweler(planCode = 'JEWELER_BASIC') {
    const jeweler = await createPublishedJeweler(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(jeweler.auth).send({ planCode }).expect(201);
    return jeweler;
  }

  async function leadCounts(jeweler: TestJeweler) {
    const leads = await t.prisma.lead.findMany({ where: { subscription: { userId: jeweler.id } } });
    return {
      available: leads.filter((l) => l.status === 'AVAILABLE').length,
      consumed: leads.filter((l) => l.status === 'CONSUMED'),
    };
  }

  it('consumes one lead from the targeted jeweler', async () => {
    const jeweler = await subscribedJeweler();
    const designer = await registerVerified(t);
    const request = await requestQuote(t, designer, jeweler);
    expect(request.status).toBe(201);

    const counts = await leadCounts(jeweler);
    expect(counts.available).toBe(2);
    expect(counts.consumed).toHaveLength(1);
    expect(counts.consumed[0].sourceRequestId).toBe(request.body.data.id);
    // Regression: raw SQL dates were shifted by the database session time zone.
    expect(Math.abs(counts.consumed[0].consumedAt!.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('a lead is still usable in the last hours of its billing period', async () => {
    const jeweler = await subscribedJeweler();
    await t.prisma.lead.updateMany({
      where: { subscription: { userId: jeweler.id }, status: 'AVAILABLE' },
      data: { periodEnd: new Date(Date.now() + 30 * 60_000) },
    });
    const designer = await registerVerified(t);
    const request = await requestQuote(t, designer, jeweler);
    expect(request.status).toBe(201);

    const counts = await leadCounts(jeweler);
    expect(counts.consumed).toHaveLength(1);
  });

  it('a lead whose billing period has ended is not consumed', async () => {
    const jeweler = await subscribedJeweler();
    await t.prisma.lead.updateMany({
      where: { subscription: { userId: jeweler.id }, status: 'AVAILABLE' },
      data: { periodEnd: new Date(Date.now() - 30 * 60_000) },
    });
    const designer = await registerVerified(t);
    await requestQuote(t, designer, jeweler);

    const counts = await leadCounts(jeweler);
    expect(counts.consumed).toHaveLength(0);
  });

  it('leads of a period that has not started are not spent now', async () => {
    const jeweler = await subscribedJeweler();
    await t.prisma.lead.updateMany({
      where: { subscription: { userId: jeweler.id }, status: 'AVAILABLE' },
      data: { periodStart: new Date(Date.now() + 24 * 60 * 60_000) },
    });
    const designer = await registerVerified(t);
    expect((await requestQuote(t, designer, jeweler)).status).toBe(201);
    expect((await leadCounts(jeweler)).consumed).toHaveLength(0);
  });

  it('a jeweler pays one lead per design, however often it is requested again', async () => {
    const jeweler = await subscribedJeweler();
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    expect((await requestQuote(t, designer, jeweler, design.id)).status).toBe(201);
    const again = await requestQuote(t, designer, jeweler, design.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REQUESTED');
    expect((await leadCounts(jeweler)).consumed).toHaveLength(1);
  });

  it('a targeted request names at most 20 jewelers', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const ids = Array.from({ length: 21 }, () => randomUUID());
    const res = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: design.id, mode: 'TARGETED', targetJewelerProfileIds: ids })
      .expect(400);
    expect((res.body.errors as Array<{ field: string }>).map((e) => e.field)).toContain('targetJewelerProfileIds');
  });

  it('with enforcement on, the last lead goes to exactly one of two simultaneous requests', async () => {
    await setLeadPolicy(t, true);
    const jeweler = await subscribedJeweler();
    const leads = await t.prisma.lead.findMany({ where: { subscription: { userId: jeweler.id } } });
    await t.prisma.lead.updateMany({
      where: { id: { in: leads.slice(1).map((l) => l.id) } },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    });

    const designers = await Promise.all([registerVerified(t), registerVerified(t)]);
    const results = await Promise.all(designers.map((d) => requestQuote(t, d, jeweler)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await t.prisma.eventLog.count({ where: { eventKey: 'lead.consumed', entityId: leads[0].id } })).toBe(1);
  });

  it('with enforcement off, delivery never records an overage charge', async () => {
    const jeweler = await subscribedJeweler('JEWELER_ACTIVE');
    await t.prisma.lead.updateMany({ where: { subscription: { userId: jeweler.id } }, data: { status: 'CONSUMED' } });
    const designer = await registerVerified(t);
    expect((await requestQuote(t, designer, jeweler)).status).toBe(201);
    expect(await t.prisma.leadOverageCharge.count({ where: { subscription: { userId: jeweler.id } } })).toBe(0);
  });

  it('with enforcement on, a plan whose overage price is zero records no charge', async () => {
    await setLeadPolicy(t, true);
    const jeweler = await subscribedJeweler();
    await t.prisma.lead.updateMany({ where: { subscription: { userId: jeweler.id } }, data: { status: 'CONSUMED' } });
    const plan = await t.prisma.planCatalog.findUniqueOrThrow({ where: { code: 'JEWELER_BASIC' } });
    await t.prisma.planCatalog.update({ where: { id: plan.id }, data: { extraLeadPrice: 0 } });
    try {
      const designer = await registerVerified(t);
      expect((await requestQuote(t, designer, jeweler)).status).toBe(409);
      expect(await t.prisma.leadOverageCharge.count({ where: { subscription: { userId: jeweler.id } } })).toBe(0);
    } finally {
      await t.prisma.planCatalog.update({ where: { id: plan.id }, data: { extraLeadPrice: plan.extraLeadPrice } });
    }
  });

  it('never hands the last lead to two simultaneous requests', async () => {
    const jeweler = await subscribedJeweler();
    const leads = await t.prisma.lead.findMany({ where: { subscription: { userId: jeweler.id } } });
    await t.prisma.lead.updateMany({
      where: { id: { in: leads.slice(1).map((l) => l.id) } },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    });

    const designers = await Promise.all([registerVerified(t), registerVerified(t)]);
    const results = await Promise.all(designers.map((d) => requestQuote(t, d, jeweler)));
    expect(results.every((r) => r.status === 201)).toBe(true);

    const counts = await leadCounts(jeweler);
    expect(counts.available).toBe(0);
    const sources = counts.consumed.map((l) => l.sourceRequestId).filter(Boolean);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.filter((s) => results.some((r) => r.body.data.id === s))).toHaveLength(1);
  });

  it('with enforcement on, a jeweler with no leads is not delivered to', async () => {
    await setLeadPolicy(t, true);
    const jeweler = await createPublishedJeweler(t);
    const designer = await registerVerified(t);
    const res = await requestQuote(t, designer, jeweler);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_ELIGIBLE_JEWELERS');
  });

  it('with enforcement on, a plan with an overage price delivers and records the charge', async () => {
    await setLeadPolicy(t, true);
    const jeweler = await subscribedJeweler('JEWELER_ACTIVE');
    await t.prisma.lead.updateMany({
      where: { subscription: { userId: jeweler.id } },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    });
    const designer = await registerVerified(t);
    const res = await requestQuote(t, designer, jeweler);
    expect(res.status).toBe(201);

    const charges = await t.prisma.leadOverageCharge.findMany({
      where: { subscription: { userId: jeweler.id } },
    });
    expect(charges).toHaveLength(1);
    expect(charges[0].amount.toString()).toBe('25');
    expect(charges[0].designRequestId).toBe(res.body.data.id);
  });
});

/** Regression: any user could drain a jeweler's leads, or run up overage charges against them. */
describe('lead drain protection', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { DESIGN_REQUESTS_PER_DAY: '2', LEAD_OVERAGE_CAP: '1' } });
  });

  afterEach(async () => {
    await setLeadPolicy(t, false);
  });

  afterAll(async () => {
    await t.close();
  });

  it('a designer can send only a limited number of design requests a day', async () => {
    const jeweler = await createPublishedJeweler(t);
    const designer = await registerVerified(t);
    expect((await requestQuote(t, designer, jeweler)).status).toBe(201);
    expect((await requestQuote(t, designer, jeweler)).status).toBe(201);
    const third = await requestQuote(t, designer, jeweler);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('REQUEST_QUOTA_EXCEEDED');
  });

  it('the daily request limit holds under simultaneous requests', async () => {
    const jeweler = await createPublishedJeweler(t);
    const designer = await registerVerified(t);
    const designs = await Promise.all(Array.from({ length: 4 }, () => createPublishedDesign(t, designer)));
    const results = await Promise.all(designs.map((design) => requestQuote(t, designer, jeweler, design.id)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 429, 429]);
  });

  it('the overage cap holds under simultaneous deliveries', async () => {
    await setLeadPolicy(t, true);
    const jeweler = await createPublishedJeweler(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(jeweler.auth).send({ planCode: 'JEWELER_ACTIVE' }).expect(201);
    await t.prisma.lead.updateMany({ where: { subscription: { userId: jeweler.id } }, data: { status: 'CONSUMED' } });
    const designers = await Promise.all([registerVerified(t), registerVerified(t), registerVerified(t)]);
    const results = await Promise.all(designers.map((designer) => requestQuote(t, designer, jeweler)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await t.prisma.leadOverageCharge.count({ where: { subscription: { userId: jeweler.id } } })).toBe(1);
  });

  it('the overage cap still holds after an early renewal moved the period start into the future', async () => {
    await setLeadPolicy(t, true);
    const jeweler = await createPublishedJeweler(t);
    const sub = (
      await t.http.post(`${API}/subscriptions/subscribe`).set(jeweler.auth).send({ planCode: 'JEWELER_ACTIVE' }).expect(201)
    ).body.data as { id: string };
    await t.prisma.lead.updateMany({ where: { subscription: { userId: jeweler.id } }, data: { status: 'CONSUMED' } });
    // The next period was paid ahead of time, so the recorded period starts in the future.
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'ACTIVE',
        trialEndsAt: null,
        currentPeriodStart: new Date(Date.now() + 10 * DAY_MS),
        currentPeriodEnd: new Date(Date.now() + 40 * DAY_MS),
      },
    });
    expect((await requestQuote(t, await registerVerified(t), jeweler)).status).toBe(201);
    expect((await requestQuote(t, await registerVerified(t), jeweler)).status).toBe(409);
    expect(await t.prisma.leadOverageCharge.count({ where: { subscription: { userId: jeweler.id } } })).toBe(1);
  });

  it('overage charges are capped per billing period', async () => {
    await setLeadPolicy(t, true);
    const jeweler = await createPublishedJeweler(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(jeweler.auth).send({ planCode: 'JEWELER_ACTIVE' }).expect(201);
    await t.prisma.lead.updateMany({ where: { subscription: { userId: jeweler.id } }, data: { status: 'CONSUMED' } });

    expect((await requestQuote(t, await registerVerified(t), jeweler)).status).toBe(201);
    const capped = await requestQuote(t, await registerVerified(t), jeweler);
    expect(capped.status).toBe(409);
    expect(await t.prisma.leadOverageCharge.count({ where: { subscription: { userId: jeweler.id } } })).toBe(1);
  });
});

/** Regression: the payment amount came from the client and quote ownership was not checked. */
describe('jewelry payment intents', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.prisma.featureFlag.upsert({
      where: { key: 'phase3_jewelry_pay' },
      update: { enabled: true, rolloutPct: 100, audience: undefined },
      create: { key: 'phase3_jewelry_pay', enabled: true, rolloutPct: 100 },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  async function acceptedQuote() {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);
    return { ...s, quote };
  }

  it('rejects a client-supplied amount', async () => {
    const { designer, quote } = await acceptedQuote();
    await t.http
      .post(`${API}/jewelry-payments/intents`)
      .set(designer.auth)
      .send({ quoteId: quote.id, amount: 1, currency: 'ILS' })
      .expect(400);
  });

  it('charges exactly the accepted quote total', async () => {
    const { designer, quote } = await acceptedQuote();
    const res = await t.http
      .post(`${API}/jewelry-payments/intents`)
      .set(designer.auth)
      .send({ quoteId: quote.id })
      .expect(201);
    expect(res.body.data.amount).toBe(150);
    expect(res.body.data.currency).toBe('ILS');
    expect(res.body.data.quoteId).toBe(quote.id);
  });

  it('only the design owner can pay', async () => {
    const { jeweler, quote } = await acceptedQuote();
    await t.http.post(`${API}/jewelry-payments/intents`).set(jeweler.auth).send({ quoteId: quote.id }).expect(403);
    const stranger = await registerVerified(t);
    await t.http.post(`${API}/jewelry-payments/intents`).set(stranger.auth).send({ quoteId: quote.id }).expect(403);
  });

  it('a quote that was not accepted cannot be paid', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    const res = await t.http
      .post(`${API}/jewelry-payments/intents`)
      .set(s.designer.auth)
      .send({ quoteId: quote.id })
      .expect(409);
    expect(res.body.code).toBe('QUOTE_NOT_ACCEPTED');
  });

  it('simultaneous payment attempts open a single intent', async () => {
    const { designer, quote } = await acceptedQuote();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        t.http.post(`${API}/jewelry-payments/intents`).set(designer.auth).send({ quoteId: quote.id }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await t.prisma.jewelryPaymentIntent.count({ where: { quoteId: quote.id } })).toBe(1);
  });

  it('repeated creation returns the same open intent', async () => {
    const { designer, quote } = await acceptedQuote();
    const first = await t.http.post(`${API}/jewelry-payments/intents`).set(designer.auth).send({ quoteId: quote.id }).expect(201);
    const second = await t.http.post(`${API}/jewelry-payments/intents`).set(designer.auth).send({ quoteId: quote.id }).expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });
});

describe('jewelry payment intents without an explicitly chosen provider', () => {
  let t: TestApp;

  beforeAll(async () => {
    // Development or a forgotten NODE_ENV must not hand out fake client secrets by default.
    t = await createTestApp({ env: { PAYMENTS_PROVIDER: undefined, NODE_ENV: 'development' } });
    await t.prisma.featureFlag.upsert({
      where: { key: 'phase3_jewelry_pay' },
      update: { enabled: true, rolloutPct: 100 },
      create: { key: 'phase3_jewelry_pay', enabled: true, rolloutPct: 100 },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('fails closed', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);
    const res = await t.http
      .post(`${API}/jewelry-payments/intents`)
      .set(s.designer.auth)
      .send({ quoteId: quote.id })
      .expect(503);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
  });
});

describe('jewelry payment intents with a real provider key but no integration', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { STRIPE_SECRET_KEY: 'sk_live_dummy_for_test' } });
    await t.prisma.featureFlag.upsert({
      where: { key: 'phase3_jewelry_pay' },
      update: { enabled: true, rolloutPct: 100 },
      create: { key: 'phase3_jewelry_pay', enabled: true, rolloutPct: 100 },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('fails closed instead of returning a fake client secret', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);
    const res = await t.http
      .post(`${API}/jewelry-payments/intents`)
      .set(s.designer.auth)
      .send({ quoteId: quote.id })
      .expect(503);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
  });
});
