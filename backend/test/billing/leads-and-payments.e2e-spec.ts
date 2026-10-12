import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  createPublishedDesign,
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  registerVerified,
  TestJeweler,
  TestUser,
} from '../utils/factories';

async function setLeadPolicy(t: TestApp, enforceQuota: boolean) {
  await t.prisma.appConfig.upsert({
    where: { key: 'lead_definition' },
    update: { value: { mode: 'design_request_delivery', enforceQuota }, version: { increment: 1 } },
    create: { key: 'lead_definition', value: { mode: 'design_request_delivery', enforceQuota } },
  });
}

async function requestQuote(t: TestApp, designer: TestUser, jeweler: TestJeweler) {
  const design = await createPublishedDesign(t, designer);
  return t.http
    .post(`${API}/atelier/requests`)
    .set(designer.auth)
    .send({ designId: design.id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] });
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
    await t.http.post(`${API}/quotes/${quote.id}/accept`).set(s.designer.auth).send({}).expect(201);
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

  it('repeated creation returns the same open intent', async () => {
    const { designer, quote } = await acceptedQuote();
    const first = await t.http.post(`${API}/jewelry-payments/intents`).set(designer.auth).send({ quoteId: quote.id }).expect(201);
    const second = await t.http.post(`${API}/jewelry-payments/intents`).set(designer.auth).send({ quoteId: quote.id }).expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
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
    await t.http.post(`${API}/quotes/${quote.id}/accept`).set(s.designer.auth).send({}).expect(201);
    const res = await t.http
      .post(`${API}/jewelry-payments/intents`)
      .set(s.designer.auth)
      .send({ quoteId: quote.id })
      .expect(503);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
  });
});
