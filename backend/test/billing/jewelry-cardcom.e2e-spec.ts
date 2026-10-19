import { UserRole } from '@prisma/client';
import { CardcomClient } from '../../src/common/payments/cardcom.client';
import { FakeCardcom } from '../utils/fake-cardcom';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { acceptQuote, createQuote, marketplaceScenario, registerVerified, TestUser } from '../utils/factories';

/**
 * A designer pays an accepted quote by card (Cardcom) inside the app; the money comes to the
 * platform, which owes it to the jeweler (less its commission) and transfers it by hand.
 */
describe('jewelry payments through Cardcom', () => {
  let t: TestApp;
  const cardcom = new FakeCardcom();

  beforeAll(async () => {
    t = await createTestApp({
      env: {
        PAYMENTS_PROVIDER: 'cardcom',
        CARDCOM_TERMINAL_NUMBER: '1000',
        CARDCOM_API_NAME: 'test-api',
        API_PUBLIC_URL: 'https://api.example.test',
        JEWELRY_COMMISSION_PERCENT: '10',
      },
      configure: (b) => b.overrideProvider(CardcomClient).useValue(cardcom),
    });
    await t.prisma.featureFlag.upsert({
      where: { key: 'phase3_jewelry_pay' },
      update: { enabled: true, rolloutPct: 100, audience: undefined },
      create: { key: 'phase3_jewelry_pay', enabled: true, rolloutPct: 100 },
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

  async function acceptedQuote() {
    const s = await marketplaceScenario(t);
    // 1,000 + 500 = 1,500 ILS
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id, { materialsCost: 1000, laborCost: 500 });
    await acceptQuote(t, s.designer, quote).expect(201);
    return { ...s, quote };
  }

  const pay = (designer: TestUser, quoteId: string) => t.http.post(`${API}/jewelry-payments/intents`).set(designer.auth).send({ quoteId });

  /** The designer paid the quote on the Cardcom page. */
  async function paidQuote() {
    const s = await acceptedQuote();
    const intent = (await pay(s.designer, s.quote.id).expect(201)).body.data;
    const row = await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    cardcom.pay(row.providerRef as string);
    await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: row.providerRef }).expect(200);
    return { ...s, intent, row };
  }

  it('opens a Cardcom page for the quote, at its price (a one-off charge, with the receipt)', async () => {
    const { designer, quote } = await acceptedQuote();
    const res = await pay(designer, quote.id).expect(201);
    expect(res.body.data).toMatchObject({ status: 'requires_confirmation', amount: 1500, currency: 'ILS', provider: 'cardcom' });
    expect(res.body.data.paymentUrl).toMatch(/^https:\/\/secure\.cardcom\.solutions\/pay\//);
    expect(res.body.data.clientSecret).toBe('');
    const row = await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(cardcom.pages.get(row.providerRef as string)?.input).toMatchObject({
      operation: 'ChargeOnly',
      amount: 1500,
      currency: 'ILS',
      returnValue: res.body.data.id,
      successUrl: `https://api.example.test/api/v1/payments/cardcom/return?jewelry=${res.body.data.id}&result=success`,
      webhookUrl: 'https://api.example.test/api/v1/webhooks/cardcom',
    });
  });

  it('once Cardcom confirms it, the payment succeeds and the jeweler is owed it less the commission, and told', async () => {
    const { intent, row, jeweler, designer, quote } = await paidQuote();
    const paid = await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    expect(paid.status).toBe('SUCCEEDED');
    expect(paid.transactionId).toBe(cardcom.pages.get(row.providerRef as string)?.result.transactionId);
    const payout = await t.prisma.jewelerPayout.findUniqueOrThrow({ where: { jewelryPaymentIntentId: intent.id } });
    expect(payout).toMatchObject({ jewelerUserId: jeweler.id, quoteId: quote.id, status: 'OWED', currency: 'ILS' });
    expect([Number(payout.grossAmount), Number(payout.commissionAmount), Number(payout.netAmount)]).toEqual([1500, 150, 1350]);
    expect(await t.prisma.notification.count({ where: { userId: jeweler.id, eventKey: 'jewelry_payment.received' } })).toBe(1);
    const view = await t.http.get(`${API}/jewelry-payments/intents/${intent.id}`).set(designer.auth).expect(200);
    expect(view.body.data.status).toBe('succeeded');
  });

  it('the same notification twice: one payment, one debt to the jeweler', async () => {
    const { intent, row } = await paidQuote();
    await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: row.providerRef }).expect(200);
    expect(await t.prisma.jewelerPayout.count({ where: { jewelryPaymentIntentId: intent.id } })).toBe(1);
  });

  it('a quote that was paid is not paid again', async () => {
    const { designer, quote } = await paidQuote();
    expect((await pay(designer, quote.id).expect(409)).body.code).toBe('QUOTE_ALREADY_PAID');
  });

  it('the return page confirms the payment with Cardcom; the intent shows it', async () => {
    const { designer, quote } = await acceptedQuote();
    const intent = (await pay(designer, quote.id).expect(201)).body.data;
    const row = await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    cardcom.pay(row.providerRef as string);
    await t.http.get(`${API}/payments/cardcom/return`).query({ jewelry: intent.id, result: 'success' }).expect(200);
    expect((await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status).toBe('SUCCEEDED');
  });

  it('a payment Cardcom does not confirm, or at another amount, does not count (the latter is kept for review)', async () => {
    const { designer, quote } = await acceptedQuote();
    const intent = (await pay(designer, quote.id).expect(201)).body.data;
    const row = await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: row.providerRef, ResponseCode: 0 }).expect(200);
    expect((await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status).toBe('REQUIRES_CONFIRMATION');

    cardcom.pay(row.providerRef as string, { amount: 15 });
    await t.http.post(`${API}/webhooks/cardcom`).send({ LowProfileId: row.providerRef }).expect(200);
    expect((await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status).not.toBe('SUCCEEDED');
    expect(await t.prisma.jewelerPayout.count({ where: { jewelryPaymentIntentId: intent.id } })).toBe(0);
    const review = await t.prisma.paymentEvent.findFirstOrThrow({ where: { jewelryPaymentIntentId: intent.id, outcome: 'NEEDS_REVIEW' } });
    expect(review.note).toContain('1500');
  });

  describe('the admin side', () => {
    it('lists what is owed to jewelers, and records a transfer once', async () => {
      const { intent, jeweler } = await paidQuote();
      const boss = await admin();
      const owed = await t.http.get(`${API}/admin/jewelry-payouts`).set(boss.auth).query({ status: 'OWED' }).expect(200);
      const payout = owed.body.data.find((item: { paymentId: string }) => item.paymentId === intent.id);
      expect(payout).toMatchObject({ status: 'OWED', due: 1350, jeweler: { id: jeweler.id, email: jeweler.email } });

      const marked = await t.http.post(`${API}/admin/jewelry-payouts/${payout.id}/mark-paid`).set(boss.auth).send({ reference: 'העברה 4471' }).expect(201);
      expect(marked.body.data).toMatchObject({ status: 'PAID', paidReference: 'העברה 4471' });
      expect((await t.http.post(`${API}/admin/jewelry-payouts/${payout.id}/mark-paid`).set(boss.auth).send({ reference: 'x' }).expect(409)).body.code).toBe(
        'PAYOUT_NOT_OWED',
      );
    });

    it('a full refund before the transfer refunds the designer and cancels the debt', async () => {
      const { intent } = await paidQuote();
      const boss = await admin();
      const refund = await t.http.post(`${API}/admin/jewelry-payments/${intent.id}/refunds`).set(boss.auth).send({ reason: 'ההזמנה בוטלה' }).expect(201);
      expect(refund.body.data).toMatchObject({ status: 'SUCCEEDED', amount: 1500 });
      expect((await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status).toBe('REFUNDED');
      expect((await t.prisma.jewelerPayout.findUniqueOrThrow({ where: { jewelryPaymentIntentId: intent.id } })).status).toBe('CANCELLED');
    });

    it('a partial refund takes the refunded amount off what the jeweler is owed', async () => {
      const { intent } = await paidQuote();
      const boss = await admin();
      await t.http.post(`${API}/admin/jewelry-payments/${intent.id}/refunds`).set(boss.auth).send({ amount: 300, reason: 'פיצוי על עיכוב' }).expect(201);
      const payout = await t.prisma.jewelerPayout.findUniqueOrThrow({ where: { jewelryPaymentIntentId: intent.id } });
      expect(payout.status).toBe('OWED');
      expect(Number(payout.refundedAmount)).toBe(300);
      const owed = await t.http.get(`${API}/admin/jewelry-payouts`).set(boss.auth).query({ status: 'OWED' }).expect(200);
      expect(owed.body.data.find((item: { paymentId: string }) => item.paymentId === intent.id).due).toBe(1050);
      expect((await t.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status).toBe('SUCCEEDED');
    });

    it('a refund after the transfer shows what to recover from the jeweler', async () => {
      const { intent } = await paidQuote();
      const boss = await admin();
      const payout = await t.prisma.jewelerPayout.findUniqueOrThrow({ where: { jewelryPaymentIntentId: intent.id } });
      await t.http.post(`${API}/admin/jewelry-payouts/${payout.id}/mark-paid`).set(boss.auth).send({ reference: 'העברה' }).expect(201);
      await t.http.post(`${API}/admin/jewelry-payments/${intent.id}/refunds`).set(boss.auth).send({ amount: 200, reason: 'החזר חלקי' }).expect(201);
      const paid = await t.http.get(`${API}/admin/jewelry-payouts`).set(boss.auth).query({ status: 'PAID' }).expect(200);
      expect(paid.body.data.find((item: { paymentId: string }) => item.paymentId === intent.id)).toMatchObject({ status: 'PAID', due: -200 });
    });

    it('only admins see and manage payouts and jewelry refunds', async () => {
      const { intent, designer } = await paidQuote();
      await t.http.get(`${API}/admin/jewelry-payouts`).set(designer.auth).expect(403);
      await t.http.post(`${API}/admin/jewelry-payments/${intent.id}/refunds`).set(designer.auth).send({ reason: 'x' }).expect(403);
    });

    it('lists the jewelry payments with their refunds', async () => {
      const { intent, designer } = await paidQuote();
      const boss = await admin();
      const list = await t.http.get(`${API}/admin/jewelry-payments`).set(boss.auth).expect(200);
      expect(list.body.data.find((item: { id: string }) => item.id === intent.id)).toMatchObject({
        amount: 1500,
        status: 'SUCCEEDED',
        refundable: 1500,
        designer: { email: designer.email },
      });
    });
  });
});
