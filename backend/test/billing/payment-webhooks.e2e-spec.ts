import { createHmac, randomUUID } from 'crypto';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

const SECRET = 'whsec_test_0123456789abcdef0123456789';
const DAY_MS = 24 * 60 * 60 * 1000;

function signature(rawBody: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

type EventFields = {
  type?: string;
  provider?: string;
  providerEventId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  checkoutId?: string;
  amount?: number;
  currency?: string;
};

function event(fields: EventFields): string {
  return JSON.stringify({
    provider: fields.provider ?? 'test',
    providerEventId: fields.providerEventId ?? `evt_${randomUUID()}`,
    type: fields.type ?? 'invoice.paid',
    subscriptionId: fields.subscriptionId,
    invoiceId: fields.invoiceId,
    checkoutId: fields.checkoutId,
    amount: fields.amount,
    currency: fields.currency,
    payload: { ok: true },
  });
}

/**
 * Regressions: POST /webhooks/payments was public with no signature, so anyone could mark a
 * subscription paid (or cancel someone else's) and store arbitrary payloads. Then: renewals were
 * not tied to an invoice or amount (two notifications of one charge added two periods), and a
 * verified payment for a subscription the sweep had already expired was silently dropped.
 */
describe('payment webhooks', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { PAYMENT_WEBHOOK_SECRET: SECRET } });
  });

  afterAll(async () => {
    await t.close();
  });

  async function trialingSubscription(user?: TestUser) {
    const designer = user ?? (await registerVerified(t));
    const res = await t.http
      .post(`${API}/subscriptions/subscribe`)
      .set(designer.auth)
      .send({ planCode: 'DESIGNER_PRO' })
      .expect(201);
    return { designer, sub: res.body.data as { id: string; currentPeriodEnd: string } };
  }

  async function invoiceFor(subscriptionId: string, overrides: EventFields = {}) {
    const sub = await t.prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { plan: true } });
    return event({
      subscriptionId,
      invoiceId: `in_${randomUUID()}`,
      amount: Number(sub.plan.price),
      currency: sub.plan.currency,
      ...overrides,
    });
  }

  function post(rawBody: string, sig?: string) {
    const req = t.http.post(`${API}/webhooks/payments`).set('Content-Type', 'application/json');
    if (sig !== undefined) {
      req.set('x-webhook-signature', sig);
    }
    return req.send(rawBody);
  }

  function deliver(rawBody: string) {
    return post(rawBody, signature(rawBody));
  }

  async function stored(id: string) {
    return t.prisma.subscription.findUniqueOrThrow({ where: { id } });
  }

  async function outcomeOf(rawBody: string) {
    const { provider, providerEventId } = JSON.parse(rawBody) as { provider: string; providerEventId: string };
    const row = await t.prisma.paymentEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
    return row.outcome;
  }

  it('rejects an unsigned event and changes nothing', async () => {
    const { sub } = await trialingSubscription();
    await post(await invoiceFor(sub.id)).expect(401);
    expect((await stored(sub.id)).status).toBe('TRIALING');
    expect(await t.prisma.paymentEvent.count({ where: { subscriptionId: sub.id } })).toBe(0);
  });

  it('rejects a signature made with another secret', async () => {
    const { sub } = await trialingSubscription();
    const body = await invoiceFor(sub.id);
    await post(body, signature(body, 'whsec_attacker_guess_0000000000000')).expect(401);
    expect((await stored(sub.id)).status).toBe('TRIALING');
  });

  it('rejects a signature over a different body', async () => {
    const { sub } = await trialingSubscription();
    const signedBody = event({ subscriptionId: sub.id, type: 'subscription.cancelled' });
    await post(await invoiceFor(sub.id), signature(signedBody)).expect(401);
    expect((await stored(sub.id)).status).toBe('TRIALING');
  });

  it('rejects a stale (replayed) signature', async () => {
    const { sub } = await trialingSubscription();
    const body = await invoiceFor(sub.id);
    await post(body, signature(body, SECRET, Math.floor(Date.now() / 1000) - 3600)).expect(401);
    expect((await stored(sub.id)).status).toBe('TRIALING');
  });

  it('verifies the exact bytes received (whitespace and key order included)', async () => {
    const { sub } = await trialingSubscription();
    const parsed = JSON.parse(await invoiceFor(sub.id)) as Record<string, unknown>;
    const fields = Object.entries(parsed)
      .reverse()
      .map(([key, value]) => `  ${JSON.stringify(key)} :  ${JSON.stringify(value)}`);
    const odd = `{\n${fields.join(' ,\n')}\n}\n`;
    await deliver(odd).expect(201);
    expect((await stored(sub.id)).status).toBe('ACTIVE');
  });

  it('a malformed or invalid body is refused and nothing is recorded', async () => {
    const before = await t.prisma.paymentEvent.count();
    await deliver('{not json').expect(400);
    await deliver(JSON.stringify({ provider: 'test', type: 'invoice.paid' })).expect(400);
    expect(await t.prisma.paymentEvent.count()).toBe(before);
  });

  it('a paid invoice activates the subscription and extends the period', async () => {
    const { sub } = await trialingSubscription();
    await deliver(await invoiceFor(sub.id)).expect(201);
    const row = await stored(sub.id);
    expect(row.status).toBe('ACTIVE');
    expect(row.currentPeriodEnd.getTime()).toBeGreaterThanOrEqual(new Date(sub.currentPeriodEnd).getTime() + 29 * DAY_MS);
  });

  it('delivering the same event concurrently applies it once', async () => {
    const { sub } = await trialingSubscription();
    const body = await invoiceFor(sub.id);
    const results = await Promise.all(Array.from({ length: 4 }, () => deliver(body)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await t.prisma.paymentEvent.count({ where: { subscriptionId: sub.id } })).toBe(1);
    expect((await stored(sub.id)).currentPeriodEnd.getTime()).toBeLessThan(
      new Date(sub.currentPeriodEnd).getTime() + 31 * DAY_MS,
    );
  });

  it('one invoice renews once, however many events announce it', async () => {
    const { sub } = await trialingSubscription();
    const invoiceId = `in_${randomUUID()}`;
    await deliver(await invoiceFor(sub.id, { invoiceId })).expect(201);
    const second = await invoiceFor(sub.id, { invoiceId });
    await deliver(second).expect(201);
    expect(await outcomeOf(second)).toBe('IGNORED');
    expect((await stored(sub.id)).currentPeriodEnd.getTime()).toBeLessThan(
      new Date(sub.currentPeriodEnd).getTime() + 31 * DAY_MS,
    );
    expect(await t.prisma.subscriptionInvoice.count({ where: { subscriptionId: sub.id } })).toBe(1);
  });

  it('only invoice.paid renews: other success notifications add nothing', async () => {
    const { sub } = await trialingSubscription();
    const body = event({ subscriptionId: sub.id, type: 'payment.succeeded' });
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('IGNORED');
    expect((await stored(sub.id)).status).toBe('TRIALING');
  });

  it('a paid amount or currency that does not match the plan is held for review, not applied', async () => {
    const { sub } = await trialingSubscription();
    const cheap = await invoiceFor(sub.id, { amount: 1 });
    await deliver(cheap).expect(201);
    expect(await outcomeOf(cheap)).toBe('NEEDS_REVIEW');
    const otherCurrency = await invoiceFor(sub.id, { currency: 'USD' });
    await deliver(otherCurrency).expect(201);
    expect(await outcomeOf(otherCurrency)).toBe('NEEDS_REVIEW');
    expect((await stored(sub.id)).status).toBe('TRIALING');
  });

  it('a payment arriving after the sweep expired the trial reactivates it instead of being dropped', async () => {
    const { sub } = await trialingSubscription();
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED', currentPeriodEnd: new Date(Date.now() - 60_000), trialEndsAt: new Date(Date.now() - 60_000) },
    });
    const body = await invoiceFor(sub.id);
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('APPLIED');
    const row = await stored(sub.id);
    expect(row.status).toBe('ACTIVE');
    expect(row.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
  });

  it('a payment for a subscription that another live one has replaced is held for review', async () => {
    const { designer, sub } = await trialingSubscription();
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED', currentPeriodEnd: new Date(Date.now() - 60_000) },
    });
    await t.http.post(`${API}/subscriptions/subscribe`).set(designer.auth).send({ planCode: 'DESIGNER_FREE' }).expect(201);

    const body = await invoiceFor(sub.id);
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('NEEDS_REVIEW');
    expect((await stored(sub.id)).status).toBe('EXPIRED');
  });

  it('an event for an unknown subscription changes nothing and is held for review', async () => {
    const body = event({ subscriptionId: randomUUID(), invoiceId: 'in_x', amount: 49.9, currency: 'ILS' });
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('NEEDS_REVIEW');
  });

  it('a renewal that failed after the paid period ended makes a trial or plan past due', async () => {
    const { sub } = await trialingSubscription();
    await t.prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() - 60_000) } });
    await deliver(event({ subscriptionId: sub.id, type: 'invoice.payment_failed' })).expect(201);
    expect((await stored(sub.id)).status).toBe('PAST_DUE');
  });

  it('a late failure notice does not undo a payment that already renewed the plan', async () => {
    const { sub } = await trialingSubscription();
    await deliver(await invoiceFor(sub.id)).expect(201);
    const failed = event({ subscriptionId: sub.id, type: 'invoice.payment_failed' });
    await deliver(failed).expect(201);
    expect(await outcomeOf(failed)).toBe('IGNORED');
    expect((await stored(sub.id)).status).toBe('ACTIVE');
  });

  it('provider event ids are unique per provider, not across providers', async () => {
    const { sub } = await trialingSubscription();
    const shared = `evt_${randomUUID()}`;
    await deliver(event({ provider: 'alpha', providerEventId: shared, subscriptionId: sub.id, type: 'subscription.note' })).expect(201);
    await deliver(event({ provider: 'beta', providerEventId: shared, subscriptionId: sub.id, type: 'subscription.note' })).expect(201);
    expect(await t.prisma.paymentEvent.count({ where: { providerEventId: shared } })).toBe(2);
  });
});

describe('payment webhooks without a configured secret', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { PAYMENT_WEBHOOK_SECRET: '' } });
  });

  afterAll(async () => {
    await t.close();
  });

  it('fail closed', async () => {
    const body = JSON.stringify({ provider: 'x', providerEventId: 'e1', type: 'invoice.paid', payload: {} });
    await t.http
      .post(`${API}/webhooks/payments`)
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', signature(body))
      .send(body)
      .expect(503);
  });
});
