import { createHmac, randomUUID } from 'crypto';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

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

  async function complete(checkoutId: string, amount: number, currency = 'ILS', providerEventId = `evt_${randomUUID()}`) {
    const body = JSON.stringify({ provider: 'test', providerEventId, type: 'checkout.completed', checkoutId, amount, currency, payload: {} });
    await t.http
      .post(`${API}/webhooks/payments`)
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', signed(body))
      .send(body)
      .expect(201);
    return (await t.prisma.paymentEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider: 'test', providerEventId } },
    })).outcome;
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
    expect(await complete(checkout.body.data.id, 1)).toBe('NEEDS_REVIEW');
    expect(await live(user.id)).toHaveLength(0);
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
