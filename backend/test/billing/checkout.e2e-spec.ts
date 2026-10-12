import { createHmac, randomUUID } from 'crypto';
import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

const DAY_MS = 24 * 60 * 60 * 1000;

const SECRET = 'whsec_test_0123456789abcdef0123456789';

function signed(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Regression: with paid activation restricted to signed webhooks, there was no way left to buy a
 * paid plan (only an already running trial could be converted). A checkout session now fixes the
 * plan, amount and currency on the server; only the provider's signed checkout.completed with the
 * exact amount turns it into a subscription.
 */
describe('buying a paid plan', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { PAYMENT_WEBHOOK_SECRET: SECRET } });
  });

  afterAll(async () => {
    await t.close();
  });

  function startCheckout(user: TestUser, planCode = 'DESIGNER_PRO') {
    return t.http.post(`${API}/subscriptions/checkout`).set(user.auth).send({ planCode });
  }

  type Completion = { currency?: string; invoiceId?: string; providerEventId?: string };

  async function completeEvent(checkoutId: string, amount: number, opts: Completion = {}) {
    const providerEventId = opts.providerEventId ?? `evt_${randomUUID()}`;
    const body = JSON.stringify({
      provider: 'test',
      providerEventId,
      type: 'checkout.completed',
      checkoutId,
      invoiceId: opts.invoiceId,
      amount,
      currency: opts.currency ?? 'ILS',
      payload: {},
    });
    await t.http
      .post(`${API}/webhooks/payments`)
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', signed(body))
      .send(body)
      .expect(201);
    return t.prisma.paymentEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider: 'test', providerEventId } },
    });
  }

  async function complete(checkoutId: string, amount: number, opts: Completion = {}) {
    return (await completeEvent(checkoutId, amount, opts)).outcome;
  }

  async function sessionStatus(checkoutId: string) {
    return (await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: checkoutId } })).status;
  }

  async function live(userId: string) {
    return t.prisma.subscription.findMany({
      where: { userId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
      include: { plan: true },
    });
  }

  it('the server fixes the price; the confirmed payment activates the plan', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    expect(checkout.body.data.amount).toBe(49.9);
    expect(checkout.body.data.currency).toBe('ILS');
    expect(checkout.body.data.status).toBe('OPEN');

    expect(await complete(checkout.body.data.id, 49.9)).toBe('APPLIED');
    const subs = await live(user.id);
    expect(subs).toHaveLength(1);
    expect(subs[0].plan.code).toBe('DESIGNER_PRO');
    expect(subs[0].status).toBe('ACTIVE');
  });

  it('a payment for a different amount is held for review and activates nothing', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    const row = await completeEvent(checkout.body.data.id, 1);
    expect(row).toMatchObject({ outcome: 'NEEDS_REVIEW', checkoutId: checkout.body.data.id, currency: 'ILS' });
    expect(row.amount?.toString()).toBe('1');
    expect(await live(user.id)).toHaveLength(0);
    // The session shows that money arrived for it; a new purchase gets a fresh session.
    expect(await sessionStatus(checkout.body.data.id)).toBe('NEEDS_REVIEW');
    expect((await startCheckout(user).expect(201)).body.data.id).not.toBe(checkout.body.data.id);
  });

  it('a payment in another currency is held for review', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    expect(await complete(checkout.body.data.id, 49.9, { currency: 'USD' })).toBe('NEEDS_REVIEW');
    expect(await live(user.id)).toHaveLength(0);
  });

  it('a payment for an unknown checkout is held for review with the id it named', async () => {
    const unknown = randomUUID();
    const row = await completeEvent(unknown, 49.9);
    expect(row).toMatchObject({ outcome: 'NEEDS_REVIEW', checkoutId: unknown });
  });

  it('a checkout paid after it expired is still honoured (the money was taken for this plan)', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    await t.prisma.checkoutSession.update({ where: { id: checkout.body.data.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(await complete(checkout.body.data.id, 49.9)).toBe('APPLIED');
    expect(await live(user.id)).toHaveLength(1);
  });

  it('buying replaces a running trial', async () => {
    const user = await registerVerified(t);
    const trial = (await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_PRO' }).expect(201)).body.data as { id: string; status: string };
    expect(trial.status).toBe('TRIALING');
    const checkout = await startCheckout(user).expect(201);
    expect(await complete(checkout.body.data.id, 49.9)).toBe('APPLIED');
    const subs = await live(user.id);
    expect(subs).toHaveLength(1);
    expect(subs[0].id).not.toBe(trial.id);
    expect(subs[0].status).toBe('ACTIVE');
    expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: trial.id } })).status).toBe('CANCELLED');
  });

  it('a second purchase by a buyer who already pays is held for review (double payment)', async () => {
    const user = await registerVerified(t);
    const first = await startCheckout(user).expect(201);
    expect(await complete(first.body.data.id, 49.9)).toBe('APPLIED');
    const plan = await t.prisma.planCatalog.findUniqueOrThrow({ where: { code: 'DESIGNER_PRO' } });
    const second = await t.prisma.checkoutSession.create({
      data: { userId: user.id, planId: plan.id, amount: plan.price, currency: plan.currency, expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    expect(await complete(second.id, 49.9)).toBe('NEEDS_REVIEW');
    expect(await sessionStatus(second.id)).toBe('NEEDS_REVIEW');
    expect(await t.prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it('a completed checkout confirmed again for a different amount is held for review', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    expect(await complete(checkout.body.data.id, 49.9)).toBe('APPLIED');
    expect(await complete(checkout.body.data.id, 99.8)).toBe('NEEDS_REVIEW');
    expect(await t.prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it('two confirmations of one checkout at the same moment complete it once', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    const outcomes = await Promise.all([complete(checkout.body.data.id, 49.9), complete(checkout.body.data.id, 49.9)]);
    expect(outcomes.sort()).toEqual(['APPLIED', 'IGNORED']);
    expect(await t.prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it('the first invoice paid at checkout is not applied a second time as a renewal', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    const invoiceId = `in_${randomUUID()}`;
    expect(await complete(checkout.body.data.id, 49.9, { invoiceId })).toBe('APPLIED');
    const [sub] = await live(user.id);

    const providerEventId = `evt_${randomUUID()}`;
    const body = JSON.stringify({ provider: 'test', providerEventId, type: 'invoice.paid', subscriptionId: sub.id, invoiceId, amount: 49.9, currency: 'ILS', payload: {} });
    await t.http.post(`${API}/webhooks/payments`).set('Content-Type', 'application/json').set('x-webhook-signature', signed(body)).send(body).expect(201);
    const renewal = await t.prisma.paymentEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: 'test', providerEventId } } });
    expect(renewal.outcome).toBe('IGNORED');
    const after = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.currentPeriodEnd.getTime()).toBe(sub.currentPeriodEnd.getTime());
    expect(after.currentPeriodEnd.getTime()).toBeLessThan(Date.now() + 32 * DAY_MS);
  });

  it('a past-due paid plan blocks another purchase until it is cancelled', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    expect(await complete(checkout.body.data.id, 49.9)).toBe('APPLIED');
    const [sub] = await live(user.id);
    await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE', currentPeriodEnd: new Date(Date.now() - DAY_MS) } });
    expect((await startCheckout(user).expect(409)).body.code).toBe('SUBSCRIPTION_EXISTS');
    await t.http.post(`${API}/subscriptions/cancel`).set(user.auth).send({}).expect(201);
    await startCheckout(user).expect(201);
  });

  it('deleting the account ends its subscription and open checkout; a payment arriving later is held for review', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_FREE' }).expect(201);
    const checkout = await startCheckout(user).expect(201);
    await t.http.delete(`${API}/users/me`).set(user.auth).expect(200);

    expect(await live(user.id)).toHaveLength(0);
    expect(await sessionStatus(checkout.body.data.id)).toBe('CANCELLED');
    expect(await complete(checkout.body.data.id, 49.9)).toBe('NEEDS_REVIEW');
    expect(await live(user.id)).toHaveLength(0);
  });

  it('a purchase confirmed while the user subscribes to a free plan leaves one live subscription', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    const held = await lockRow(t, 'users', user.id);
    const subscribing = t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_FREE' }).then((res) => res);
    await waitForLockWaiters(t, 1);
    const completing = complete(checkout.body.data.id, 49.9);
    await waitForLockWaiters(t, 2);
    await held.release();
    expect((await subscribing).status).toBe(201);
    expect(await completing).toBe('APPLIED');
    const subs = await live(user.id);
    expect(subs.map((s) => s.plan.code)).toEqual(['DESIGNER_PRO']);
  });

  it('a checkout is completed once, however many events confirm it', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    expect(await complete(checkout.body.data.id, 49.9)).toBe('APPLIED');
    expect(await complete(checkout.body.data.id, 49.9)).toBe('IGNORED');
    expect(await t.prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it('upgrading replaces the free plan, leaving one live subscription', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode: 'DESIGNER_FREE' }).expect(201);
    const checkout = await startCheckout(user).expect(201);
    expect(await complete(checkout.body.data.id, 49.9)).toBe('APPLIED');
    const subs = await live(user.id);
    expect(subs.map((s) => s.plan.code)).toEqual(['DESIGNER_PRO']);
  });

  it('starting the same checkout twice returns the open one', async () => {
    const user = await registerVerified(t);
    const first = await startCheckout(user).expect(201);
    const second = await startCheckout(user).expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('a user who already pays for a plan cannot open another checkout', async () => {
    const user = await registerVerified(t);
    const checkout = await startCheckout(user).expect(201);
    await complete(checkout.body.data.id, 49.9);
    const again = await startCheckout(user).expect(409);
    expect(again.body.code).toBe('SUBSCRIPTION_EXISTS');
  });

  it('free plans and other roles\' plans are not sold through checkout', async () => {
    const user = await registerVerified(t);
    await startCheckout(user, 'DESIGNER_FREE').expect(400);
    await startCheckout(user, 'JEWELER_ACTIVE').expect(400);
  });
});

describe('buying a paid plan without a payment provider', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { PAYMENTS_PROVIDER: undefined } });
  });

  afterAll(async () => {
    await t.close();
  });

  it('fails closed', async () => {
    const user = await registerVerified(t);
    const res = await t.http.post(`${API}/subscriptions/checkout`).set(user.auth).send({ planCode: 'DESIGNER_PRO' }).expect(503);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
  });
});
