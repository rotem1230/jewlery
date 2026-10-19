import { UserRole } from '@prisma/client';
import { CardcomClient } from '../../src/common/payments/cardcom.client';
import { SubscriptionLifecycleService } from '../../src/subscriptions/subscription-lifecycle.service';
import { FakeCardcom } from '../utils/fake-cardcom';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { createPublishedJeweler, registerVerified, TestUser } from '../utils/factories';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_MS = 91 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

describe('refunds, card replacement and plan changes (Cardcom)', () => {
  let t: TestApp;
  const cardcom = new FakeCardcom();

  beforeAll(async () => {
    t = await createTestApp({
      env: { PAYMENTS_PROVIDER: 'cardcom', CARDCOM_TERMINAL_NUMBER: '1000', CARDCOM_API_NAME: 'test-api', API_PUBLIC_URL: 'https://api.example.test' },
      configure: (b) => b.overrideProvider(CardcomClient).useValue(cardcom),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  const sweep = (now = new Date()) => t.app.get(SubscriptionLifecycleService).runOnce(now);

  async function admin(): Promise<TestUser> {
    const user = await registerVerified(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { roles: [UserRole.DESIGNER, UserRole.ADMIN] } });
    return user;
  }

  /** A user who bought a plan on the Cardcom page (designer by default). */
  async function buyer(planCode = 'DESIGNER_PREMIUM_QUARTERLY', user?: TestUser) {
    const who = user ?? (await registerVerified(t));
    const started = (await t.http.post(`${API}/subscriptions/checkout`).set(who.auth).send({ planCode }).expect(201)).body.data;
    const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
    cardcom.pay(session.providerRef as string);
    await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: session.providerRef }).expect(200);
    const sub = await t.prisma.subscription.findFirstOrThrow({
      where: { userId: who.id, status: 'ACTIVE' },
      include: { plan: true, paymentMethod: true },
    });
    const invoice = await t.prisma.subscriptionInvoice.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    return { user: who, sub, invoice };
  }

  async function periodEndingAt(subscriptionId: string, end: Date, length = QUARTER_MS) {
    await t.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { currentPeriodStart: new Date(end.getTime() - length), currentPeriodEnd: end },
    });
    return end;
  }

  describe('refunds by an admin', () => {
    const refund = (who: TestUser, invoiceId: string, body: Record<string, unknown>) =>
      t.http.post(`${API}/admin/payments/invoices/${invoiceId}/refunds`).set(who.auth).send(body);

    it('a card payment is refunded through Cardcom, in full by default, and recorded', async () => {
      const { invoice } = await buyer();
      expect(invoice.provider).toBe('cardcom');
      const boss = await admin();
      const res = await refund(boss, invoice.id, { reason: 'ביקשה לבטל' }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'SUCCEEDED', amount: 45, currency: 'ILS', reason: 'ביקשה לבטל' });
      const sent = cardcom.refunds[cardcom.refunds.length - 1];
      expect(sent).toMatchObject({ transactionId: invoice.providerInvoiceId });
      expect(sent.amount).toBeUndefined();
      expect(sent.externalRefundId).toBe(res.body.data.id);
    });

    it('a part of it, and never more than what is left to refund', async () => {
      const { invoice } = await buyer();
      const boss = await admin();
      await refund(boss, invoice.id, { amount: 20, reason: 'פיצוי' }).expect(201);
      expect(cardcom.refunds[cardcom.refunds.length - 1].amount).toBe(20);
      const tooMuch = await refund(boss, invoice.id, { amount: 30, reason: 'עוד' }).expect(400);
      expect(tooMuch.body.code).toBe('REFUND_EXCEEDS_PAYMENT');
      await refund(boss, invoice.id, { amount: 25, reason: 'השאר' }).expect(201);
      expect((await refund(boss, invoice.id, { reason: 'שוב' }).expect(400)).body.code).toBe('REFUND_EXCEEDS_PAYMENT');
    });

    it('with "end the plan", the plan ends at once', async () => {
      const { invoice, sub } = await buyer();
      const boss = await admin();
      await refund(boss, invoice.id, { reason: 'החזר מלא', endSubscription: true }).expect(201);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('CANCELLED');
    });

    it('a refund Cardcom refuses is recorded as failed, with its reason, and frees the amount again', async () => {
      const { invoice } = await buyer();
      const boss = await admin();
      cardcom.refundAnswers.push({ status: 'REFUSED', refundTransactionId: null, description: 'Already refunded' });
      const res = await refund(boss, invoice.id, { reason: 'x' }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'FAILED', failureReason: 'Already refunded' });
      await refund(boss, invoice.id, { reason: 'שוב' }).expect(201);
    });

    it('when Cardcom does not answer, the refund is UNKNOWN until an admin checks it in Cardcom and settles it', async () => {
      const { invoice } = await buyer();
      const boss = await admin();
      cardcom.refundAnswers.push('UNAVAILABLE');
      const res = await refund(boss, invoice.id, { reason: 'x' }).expect(201);
      expect(res.body.data.status).toBe('UNKNOWN');
      // Still counted: no second refund of the same money meanwhile.
      expect((await refund(boss, invoice.id, { reason: 'y' }).expect(400)).body.code).toBe('REFUND_EXCEEDS_PAYMENT');
      const settled = await t.http.post(`${API}/admin/refunds/${res.body.data.id}/resolve`).set(boss.auth).send({ outcome: 'FAILED' }).expect(201);
      expect(settled.body.data.status).toBe('FAILED');
      await refund(boss, invoice.id, { reason: 'y' }).expect(201);
      await t.http.post(`${API}/admin/refunds/${res.body.data.id}/resolve`).set(boss.auth).send({ outcome: 'SUCCEEDED' }).expect(409);
    });

    it('the same refund request sent twice (a double tap) refunds once and answers the same refund', async () => {
      const { invoice } = await buyer();
      const boss = await admin();
      const requestId = '7d9f1c2e-3333-4444-8555-666677778888';
      const before = cardcom.refunds.length;
      const [first, second] = await Promise.all([
        refund(boss, invoice.id, { amount: 10, reason: 'פיצוי', requestId }),
        refund(boss, invoice.id, { amount: 10, reason: 'פיצוי', requestId }),
      ]);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(cardcom.refunds.length - before).toBe(1);
      expect(await t.prisma.paymentRefund.count({ where: { subscriptionInvoiceId: invoice.id } })).toBe(1);
    });

    it('two refunds of the whole payment at once: one goes through', async () => {
      const { invoice } = await buyer();
      const boss = await admin();
      const results = await Promise.all([refund(boss, invoice.id, { reason: 'a' }), refund(boss, invoice.id, { reason: 'b' })]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    });

    it('only admins refund; a payment that was not by card is not refundable here', async () => {
      const { invoice, user } = await buyer();
      await refund(user, invoice.id, { reason: 'x' }).expect(403);
      const boss = await admin();
      await t.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { provider: 'mock' } });
      expect((await refund(boss, invoice.id, { reason: 'x' }).expect(400)).body.code).toBe('NOT_REFUNDABLE');
    });

    it('without the Cardcom API password, refunds are unavailable', async () => {
      const { invoice } = await buyer();
      const boss = await admin();
      cardcom.refundsEnabled = false;
      try {
        expect((await refund(boss, invoice.id, { reason: 'x' }).expect(503)).body.code).toBe('REFUNDS_NOT_CONFIGURED');
      } finally {
        cardcom.refundsEnabled = true;
      }
    });

    it('the admin sees the card payments with what was refunded and what is left', async () => {
      const { invoice, user } = await buyer();
      const boss = await admin();
      await refund(boss, invoice.id, { amount: 15, reason: 'פיצוי' }).expect(201);
      const list = await t.http.get(`${API}/admin/payments/invoices`).set(boss.auth).query({ userId: user.id }).expect(200);
      const row = list.body.data.find((item: { id: string }) => item.id === invoice.id);
      expect(row).toMatchObject({ amount: 45, refunded: 15, refundable: 30, provider: 'cardcom', user: { email: user.email }, plan: { code: 'DESIGNER_PREMIUM_QUARTERLY' } });
      expect(row.refunds).toHaveLength(1);
    });
  });

  describe('replacing the saved card', () => {
    it('opens a Cardcom page that only saves a card; the renewals then use the new card', async () => {
      const { user, sub } = await buyer();
      const current = await t.http.get(`${API}/subscriptions/payment-method`).set(user.auth).expect(200);
      expect(current.body.data).toEqual({ provider: 'cardcom', cardExpiry: '03/29', cardLast4: '4580' });

      const started = (await t.http.post(`${API}/subscriptions/payment-method/update`).set(user.auth).expect(201)).body.data;
      expect(started.paymentUrl).toMatch(/^https:\/\/secure\.cardcom\.solutions\/pay\//);
      const update = await t.prisma.paymentMethodUpdate.findUniqueOrThrow({ where: { id: started.id } });
      const page = cardcom.pages.get(update.providerRef as string);
      expect(page?.input).toMatchObject({
        operation: 'CreateTokenOnly',
        returnValue: started.id,
        successUrl: `https://api.example.test/api/v1/payments/cardcom/return?card=${started.id}&result=success`,
      });

      cardcom.pay(update.providerRef as string, { token: { token: 'new-card-token', cardExpiryMMYY: '1130', expiresAt: null } });
      await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: update.providerRef }).expect(200);
      const renewed = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { paymentMethod: true } });
      expect(renewed.paymentMethod).toMatchObject({ token: 'new-card-token', cardExpiry: '1130' });
      expect(await t.prisma.paymentMethod.count({ where: { id: sub.paymentMethodId as string } })).toBe(0);
      expect((await t.http.get(`${API}/subscriptions/payment-method/updates/${started.id}`).set(user.auth).expect(200)).body.data.status).toBe('COMPLETED');
    });

    it('a plan past due for a declined card is charged right away with the new card', async () => {
      const { user, sub } = await buyer();
      await periodEndingAt(sub.id, new Date(Date.now() - 60_000));
      cardcom.chargeAnswers.push({ status: 'DECLINED', transactionId: null, amount: null, currency: null, description: 'Card declined' });
      await sweep();
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('PAST_DUE');

      const started = (await t.http.post(`${API}/subscriptions/payment-method/update`).set(user.auth).expect(201)).body.data;
      const update = await t.prisma.paymentMethodUpdate.findUniqueOrThrow({ where: { id: started.id } });
      cardcom.pay(update.providerRef as string);
      const before = cardcom.charges.length;
      await t.http.get(`${API}/payments/cardcom/return`).query({ card: started.id, result: 'success' }).expect(200);
      expect(cardcom.charges.length - before).toBe(1);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('ACTIVE');
    });

    it('a notification for a card Cardcom did not save changes nothing', async () => {
      const { user, sub } = await buyer();
      const started = (await t.http.post(`${API}/subscriptions/payment-method/update`).set(user.auth).expect(201)).body.data;
      const update = await t.prisma.paymentMethodUpdate.findUniqueOrThrow({ where: { id: started.id } });
      await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: update.providerRef }).expect(200);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).paymentMethodId).toBe(sub.paymentMethodId);
    });

    it('deleting the account deletes its saved cards', async () => {
      const { user, sub } = await buyer();
      await t.http.delete(`${API}/users/me`).set(user.auth).expect(200);
      expect(await t.prisma.paymentMethod.count({ where: { userId: user.id } })).toBe(0);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).paymentMethodId).toBeNull();
    });

    it('only for a plan paid by card; another user cannot follow the update', async () => {
      const designer = await registerVerified(t);
      expect((await t.http.post(`${API}/subscriptions/payment-method/update`).set(designer.auth).expect(400)).body.code).toBe('NO_CARD_PLAN');
      expect((await t.http.get(`${API}/subscriptions/payment-method`).set(designer.auth).expect(200)).body.data).toBeNull();
      const { user } = await buyer();
      const started = (await t.http.post(`${API}/subscriptions/payment-method/update`).set(user.auth).expect(201)).body.data;
      await t.http.get(`${API}/subscriptions/payment-method/updates/${started.id}`).set(designer.auth).expect(404);
    });
  });

  describe('changing plans at the end of the period', () => {
    const change = (who: TestUser, planCode: string) => t.http.post(`${API}/subscriptions/change-plan`).set(who.auth).send({ planCode });

    it('the plan chosen starts at the next renewal, charged at its own price and for its own period', async () => {
      const { user, sub } = await buyer();
      const res = await change(user, 'DESIGNER_PREMIUM_ANNUAL').expect(201);
      expect(res.body.data.pendingPlan).toMatchObject({ code: 'DESIGNER_PREMIUM_ANNUAL' });
      const me = await t.http.get(`${API}/subscriptions/me`).set(user.auth).expect(200);
      expect(me.body.data).toMatchObject({ plan: { code: 'DESIGNER_PREMIUM_QUARTERLY' }, pendingPlan: { code: 'DESIGNER_PREMIUM_ANNUAL' } });

      const end = await periodEndingAt(sub.id, new Date(Date.now() + 60 * 60 * 1000));
      const before = cardcom.charges.length;
      await sweep();
      expect(cardcom.charges.slice(before).map((charge) => charge.amount)).toEqual([149]);
      const switched = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { plan: true } });
      expect(switched).toMatchObject({ status: 'ACTIVE', billingCycle: 'ANNUAL', pendingPlanId: null, plan: { code: 'DESIGNER_PREMIUM_ANNUAL' } });
      expect(Number(switched.price)).toBe(149);
      expect(switched.currentPeriodStart.getTime()).toBe(end.getTime());
      expect(switched.currentPeriodEnd.getTime()).toBe(end.getTime() + YEAR_MS);
    });

    it('a declined charge keeps the current plan; the next attempt charges the chosen plan again', async () => {
      const { user, sub } = await buyer();
      await change(user, 'DESIGNER_PREMIUM_ANNUAL').expect(201);
      await periodEndingAt(sub.id, new Date(Date.now() - 60_000));
      cardcom.chargeAnswers.push({ status: 'DECLINED', transactionId: null, amount: null, currency: null, description: 'Card declined' });
      await sweep();
      const kept = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { plan: true } });
      expect(kept.plan.code).toBe('DESIGNER_PREMIUM_QUARTERLY');
      expect(kept.pendingPlanId).not.toBeNull();
      const before = cardcom.charges.length;
      await sweep(new Date(Date.now() + DAY_MS + 60_000));
      expect(cardcom.charges.slice(before).map((charge) => charge.amount)).toEqual([149]);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { plan: true } })).plan.code).toBe('DESIGNER_PREMIUM_ANNUAL');
    });

    it("a jeweler's new plan brings its leads with the renewal", async () => {
      const jeweler = await createPublishedJeweler(t);
      const { sub } = await buyer('JEWELER_BASIC_QUARTERLY', jeweler);
      await change(jeweler, 'JEWELER_BUSINESS').expect(201);
      await periodEndingAt(sub.id, new Date(Date.now() + 60 * 60 * 1000));
      await sweep();
      const switched = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(await t.prisma.lead.count({ where: { subscriptionId: sub.id, periodEnd: switched.currentPeriodEnd } })).toBe(20);
    });

    it('the change can be withdrawn; cancelling the plan withdraws it too', async () => {
      const { user, sub } = await buyer();
      await change(user, 'DESIGNER_PREMIUM_ANNUAL').expect(201);
      await t.http.delete(`${API}/subscriptions/change-plan`).set(user.auth).expect(200);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).pendingPlanId).toBeNull();
      await change(user, 'DESIGNER_PREMIUM_ANNUAL').expect(201);
      await t.http.post(`${API}/subscriptions/cancel`).set(user.auth).expect(201);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).pendingPlanId).toBeNull();
    });

    it('only another paid plan of the same role, from a paid plan', async () => {
      const { user } = await buyer();
      expect((await change(user, 'DESIGNER_PREMIUM_QUARTERLY').expect(400)).body.code).toBe('PLAN_CHANGE_INVALID');
      expect((await change(user, 'DESIGNER_FREE').expect(400)).body.code).toBe('PLAN_CHANGE_INVALID');
      expect((await change(user, 'JEWELER_BUSINESS').expect(400)).body.code).toBe('PLAN_CHANGE_INVALID');
      const trial = await registerVerified(t);
      await t.http.post(`${API}/subscriptions/subscribe`).set(trial.auth).send({ planCode: 'DESIGNER_PREMIUM_QUARTERLY' }).expect(201);
      expect((await change(trial, 'DESIGNER_PREMIUM_ANNUAL').expect(400)).body.code).toBe('PLAN_CHANGE_INVALID');
    });
  });
});
