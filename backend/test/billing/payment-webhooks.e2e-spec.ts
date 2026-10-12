import { createHmac } from 'crypto';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified } from '../utils/factories';

const SECRET = 'whsec_test_0123456789abcdef0123456789';
const DAY_MS = 24 * 60 * 60 * 1000;

function signature(rawBody: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Regression: POST /webhooks/payments was public with no signature, so anyone could mark a
 * subscription paid (or cancel someone else's) and store arbitrary payloads.
 */
describe('payment webhooks', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { PAYMENT_WEBHOOK_SECRET: SECRET } });
  });

  afterAll(async () => {
    await t.close();
  });

  async function trialingSubscription() {
    const designer = await registerVerified(t);
    const res = await t.http
      .post(`${API}/subscriptions/subscribe`)
      .set(designer.auth)
      .send({ planCode: 'DESIGNER_PRO' })
      .expect(201);
    return res.body.data as { id: string; currentPeriodEnd: string };
  }

  function event(subscriptionId: string, type = 'invoice.paid', id = `evt_${Date.now()}_${Math.random()}`) {
    return JSON.stringify({ provider: 'test', providerEventId: id, type, subscriptionId, payload: { ok: true } });
  }

  function post(rawBody: string, sig?: string) {
    const req = t.http.post(`${API}/webhooks/payments`).set('Content-Type', 'application/json');
    if (sig !== undefined) {
      req.set('x-webhook-signature', sig);
    }
    return req.send(rawBody);
  }

  async function statusOf(id: string) {
    return (await t.prisma.subscription.findUniqueOrThrow({ where: { id } })).status;
  }

  it('rejects an unsigned event and changes nothing', async () => {
    const sub = await trialingSubscription();
    await post(event(sub.id)).expect(401);
    expect(await statusOf(sub.id)).toBe('TRIALING');
    expect(await t.prisma.paymentEvent.count({ where: { subscriptionId: sub.id } })).toBe(0);
  });

  it('rejects a signature made with another secret', async () => {
    const sub = await trialingSubscription();
    const body = event(sub.id);
    await post(body, signature(body, 'whsec_attacker_guess_0000000000000')).expect(401);
    expect(await statusOf(sub.id)).toBe('TRIALING');
  });

  it('rejects a signature over a different body', async () => {
    const sub = await trialingSubscription();
    const signedBody = event(sub.id, 'payment.failed');
    await post(event(sub.id, 'invoice.paid'), signature(signedBody)).expect(401);
    expect(await statusOf(sub.id)).toBe('TRIALING');
  });

  it('rejects a stale (replayed) signature', async () => {
    const sub = await trialingSubscription();
    const body = event(sub.id);
    await post(body, signature(body, SECRET, Math.floor(Date.now() / 1000) - 3600)).expect(401);
    expect(await statusOf(sub.id)).toBe('TRIALING');
  });

  it('applies a correctly signed invoice.paid and extends the period', async () => {
    const sub = await trialingSubscription();
    const body = event(sub.id);
    await post(body, signature(body)).expect(201);
    const stored = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(stored.currentPeriodEnd.getTime()).toBeGreaterThanOrEqual(
      new Date(sub.currentPeriodEnd).getTime() + 29 * DAY_MS,
    );
  });

  it('delivering the same event concurrently applies it once', async () => {
    const sub = await trialingSubscription();
    const body = event(sub.id, 'invoice.paid', `evt_dup_${Date.now()}`);
    const results = await Promise.all(Array.from({ length: 4 }, () => post(body, signature(body))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await t.prisma.paymentEvent.count({ where: { subscriptionId: sub.id } })).toBe(1);
    const stored = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(stored.currentPeriodEnd.getTime()).toBeLessThan(new Date(sub.currentPeriodEnd).getTime() + 31 * DAY_MS);
  });

  it('marks a failed payment past due', async () => {
    const sub = await trialingSubscription();
    const paid = event(sub.id, 'invoice.paid');
    await post(paid, signature(paid)).expect(201);
    const failed = event(sub.id, 'payment.failed');
    await post(failed, signature(failed)).expect(201);
    expect(await statusOf(sub.id)).toBe('PAST_DUE');
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
