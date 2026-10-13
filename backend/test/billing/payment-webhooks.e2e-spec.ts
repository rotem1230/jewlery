import { Prisma } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { SubscriptionLifecycleService } from '../../src/subscriptions/subscription-lifecycle.service';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service';
import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

const SECRET = 'whsec_test_0123456789abcdef0123456789';
const DAY_MS = 24 * 60 * 60 * 1000;

function signature(rawBody: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

type EventFields = {
  payload?: Record<string, unknown>;
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
    payload: fields.payload ?? { ok: true },
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

  async function trialingSubscription(user?: TestUser, planCode = 'DESIGNER_PRO') {
    const designer = user ?? (await registerVerified(t));
    const res = await t.http
      .post(`${API}/subscriptions/subscribe`)
      .set(designer.auth)
      .send({ planCode })
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

  async function eventRow(rawBody: string) {
    const { provider, providerEventId } = JSON.parse(rawBody) as { provider: string; providerEventId: string };
    return t.prisma.paymentEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
  }

  async function outcomeOf(rawBody: string) {
    return (await eventRow(rawBody)).outcome;
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

  it('an oversized body is refused as too large (413), not as a server error', async () => {
    const huge = JSON.stringify({ provider: 'test', providerEventId: `evt_${randomUUID()}`, type: 'invoice.paid', payload: { pad: 'x'.repeat(1_100_000) } });
    await deliver(huge).expect(413);
  });

  it('an unsigned body is refused and nothing is recorded', async () => {
    const before = await t.prisma.paymentEvent.count();
    await post(`{not json ${randomUUID()}`).expect(401);
    expect(await t.prisma.paymentEvent.count()).toBe(before);
  });

  it('a signed body we cannot read is kept for review instead of being refused, once per body', async () => {
    const reviewItems = () => t.prisma.paymentEvent.count({ where: { outcome: 'NEEDS_REVIEW' } });
    const before = await reviewItems();
    const garbage = `{not json ${randomUUID()}`;
    await deliver(garbage).expect(201);
    await deliver(garbage).expect(201); // the provider retries: still one item
    const invalid = JSON.stringify({ provider: 'test', providerEventId: `evt_${randomUUID()}`, type: 'invoice.paid', amount: 'lots', payload: {} });
    await deliver(invalid).expect(201);
    expect(await outcomeOf(invalid)).toBe('NEEDS_REVIEW');
    expect(await reviewItems()).toBe(before + 2);
  });

  it('a payment held for review keeps what was paid and for what', async () => {
    const { sub } = await trialingSubscription();
    const invoiceId = `in_${randomUUID()}`;
    const body = await invoiceFor(sub.id, { invoiceId, amount: 1 });
    await deliver(body).expect(201);
    const row = await eventRow(body);
    expect(row).toMatchObject({ outcome: 'NEEDS_REVIEW', subscriptionId: sub.id, invoiceId, currency: 'ILS' });
    expect(row.amount?.toString()).toBe('1');
  });

  it('the same unapplied payment announced twice is one review item', async () => {
    const { sub } = await trialingSubscription();
    const invoiceId = `in_${randomUUID()}`;
    const first = await invoiceFor(sub.id, { invoiceId, amount: 1 });
    const second = await invoiceFor(sub.id, { invoiceId, amount: 1 });
    await deliver(first).expect(201);
    await deliver(second).expect(201);
    expect(await outcomeOf(first)).toBe('NEEDS_REVIEW');
    expect(await outcomeOf(second)).toBe('IGNORED');
  });

  it('an unrecognised event that reports money is held for review', async () => {
    const { sub } = await trialingSubscription();
    const body = event({ subscriptionId: sub.id, type: 'charge.succeeded', amount: 49.9, currency: 'ILS' });
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('NEEDS_REVIEW');
    expect((await stored(sub.id)).status).toBe('TRIALING');
  });

  it('an unexpected failure while applying a payment keeps the event for review instead of losing it', async () => {
    const { sub } = await trialingSubscription();
    const spy = jest.spyOn(t.app.get(SubscriptionsService), 'allocateLeads').mockRejectedValueOnce(new Error('ledger bug'));
    try {
      const body = await invoiceFor(sub.id);
      await deliver(body).expect(201);
      const row = await eventRow(body);
      expect(row.outcome).toBe('NEEDS_REVIEW');
      expect(row.note).toContain('ledger bug');
      // Nothing was half-applied.
      expect((await stored(sub.id)).status).toBe('TRIALING');
      expect(await t.prisma.subscriptionInvoice.count({ where: { subscriptionId: sub.id } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('a transient database failure is refused, so the provider retries and the retry applies it', async () => {
    const { sub } = await trialingSubscription();
    const deadlock = new Prisma.PrismaClientKnownRequestError('deadlock detected', {
      code: 'P2034',
      clientVersion: Prisma.prismaVersion.client,
    });
    const spy = jest.spyOn(t.app.get(SubscriptionsService), 'allocateLeads').mockRejectedValueOnce(deadlock);
    try {
      const body = await invoiceFor(sub.id);
      const first = await deliver(body);
      expect(first.status).toBe(503);
      const { providerEventId } = JSON.parse(body) as { providerEventId: string };
      expect(await t.prisma.paymentEvent.count({ where: { providerEventId } })).toBe(0);
      await deliver(body).expect(201);
      expect(await outcomeOf(body)).toBe('APPLIED');
    } finally {
      spy.mockRestore();
    }
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

  it('renewals are charged at the price agreed when the subscription started, not at a later catalog price', async () => {
    const { sub } = await trialingSubscription();
    await t.prisma.planCatalog.update({ where: { code: 'DESIGNER_PRO' }, data: { price: 59.9 } });
    try {
      const atCatalogPrice = event({ subscriptionId: sub.id, invoiceId: `in_${randomUUID()}`, amount: 59.9, currency: 'ILS' });
      await deliver(atCatalogPrice).expect(201);
      expect(await outcomeOf(atCatalogPrice)).toBe('NEEDS_REVIEW');
      const atAgreedPrice = event({ subscriptionId: sub.id, invoiceId: `in_${randomUUID()}`, amount: 49.9, currency: 'ILS' });
      await deliver(atAgreedPrice).expect(201);
      expect(await outcomeOf(atAgreedPrice)).toBe('APPLIED');
    } finally {
      await t.prisma.planCatalog.update({ where: { code: 'DESIGNER_PRO' }, data: { price: 49.9 } });
    }
  });

  it('a late payment that reactivates a lapsed subscription keeps the cancellation the user asked for', async () => {
    const { designer, sub } = await trialingSubscription();
    await t.http.post(`${API}/subscriptions/cancel`).set(designer.auth).send({}).expect(201);
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED', currentPeriodEnd: new Date(Date.now() - 60_000), trialEndsAt: new Date(Date.now() - 60_000) },
    });
    const body = await invoiceFor(sub.id);
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('APPLIED');
    const row = await stored(sub.id);
    expect(row.status).toBe('ACTIVE');
    expect(row.cancelAtPeriodEnd).toBe(true);
  });

  it('a late payment for a lapsed subscription of a deleted account is held for review, not applied', async () => {
    const { designer, sub } = await trialingSubscription();
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED', currentPeriodEnd: new Date(Date.now() - 60_000), trialEndsAt: new Date(Date.now() - 60_000) },
    });
    await t.http.delete(`${API}/users/me`).set(designer.auth).expect(200);
    const body = await invoiceFor(sub.id);
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('NEEDS_REVIEW');
    expect((await stored(sub.id)).status).not.toBe('ACTIVE');
  });

  it('a signed event whose payload holds characters the database cannot store is still recorded', async () => {
    const { sub } = await trialingSubscription();
    const withNul = event({ subscriptionId: sub.id, type: 'subscription.note', payload: { note: 'a\u0000b' } });
    await deliver(withNul).expect(201);
    expect(await outcomeOf(withNul)).toBe('IGNORED');
    const loneSurrogate = event({ subscriptionId: sub.id, type: 'subscription.note', payload: { note: '\ud800' } });
    await deliver(loneSurrogate).expect(201);
    expect(await outcomeOf(loneSurrogate)).toBe('IGNORED');
  });

  it('a different kind of event for the same invoice and amount is its own review item (a refund is not a repeat)', async () => {
    const { sub } = await trialingSubscription();
    const invoiceId = `in_${randomUUID()}`;
    const paid = await invoiceFor(sub.id, { invoiceId, amount: 1 });
    await deliver(paid).expect(201);
    const refunded = event({ subscriptionId: sub.id, type: 'charge.refunded', invoiceId, amount: 1, currency: 'ILS' });
    await deliver(refunded).expect(201);
    expect(await outcomeOf(paid)).toBe('NEEDS_REVIEW');
    expect(await outcomeOf(refunded)).toBe('NEEDS_REVIEW');
  });

  it('a paid invoice for a cancelled subscription is held for review and changes nothing', async () => {
    const { sub } = await trialingSubscription();
    await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
    const body = await invoiceFor(sub.id);
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('NEEDS_REVIEW');
    expect((await stored(sub.id)).status).toBe('CANCELLED');
  });

  it('a paid invoice without an invoice id is held for review', async () => {
    const { sub } = await trialingSubscription();
    const body = await invoiceFor(sub.id, { invoiceId: undefined });
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('NEEDS_REVIEW');
    expect((await stored(sub.id)).status).toBe('TRIALING');
  });

  it('a cancellation from the provider ends the subscription', async () => {
    const { sub } = await trialingSubscription();
    const body = event({ subscriptionId: sub.id, type: 'subscription.cancelled' });
    await deliver(body).expect(201);
    expect(await outcomeOf(body)).toBe('APPLIED');
    expect((await stored(sub.id)).status).toBe('CANCELLED');
  });

  it("a jeweler's paid renewal allocates the leads of the period it pays for", async () => {
    const jeweler = await registerVerified(t, { roles: ['JEWELER'] });
    const { sub } = await trialingSubscription(jeweler, 'JEWELER_ACTIVE');
    const plan = await t.prisma.planCatalog.findUniqueOrThrow({ where: { code: 'JEWELER_ACTIVE' } });
    await deliver(await invoiceFor(sub.id)).expect(201);
    const row = await stored(sub.id);
    expect(
      await t.prisma.lead.count({
        where: { subscriptionId: sub.id, periodStart: row.currentPeriodStart, periodEnd: row.currentPeriodEnd },
      }),
    ).toBe(plan.leadQuota);
  });

  it('a renewal payment and the past-due sweep at the same moment: the payment wins', async () => {
    const { sub } = await trialingSubscription();
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 60_000) },
    });
    const blocker = await lockRow(t, 'subscriptions', sub.id);
    const paying = deliver(await invoiceFor(sub.id)).then((res) => res);
    await waitForLockWaiters(t, 1);
    const sweeping = t.app.get(SubscriptionLifecycleService).runOnce(new Date());
    await waitForLockWaiters(t, 2);
    await blocker.release();
    expect((await paying).status).toBe(201);
    await sweeping;
    const row = await stored(sub.id);
    expect(row.status).toBe('ACTIVE');
    expect(row.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
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
