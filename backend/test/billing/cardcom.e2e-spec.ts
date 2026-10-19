import { randomUUID } from 'crypto';
import {
  CardcomCharge,
  CardcomClient,
  CardcomPageResult,
  CardcomUnavailableError,
} from '../../src/common/payments/cardcom.client';
import { SubscriptionLifecycleService } from '../../src/subscriptions/subscription-lifecycle.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_MS = 91 * DAY_MS;
const PUBLIC_URL = 'https://api.example.test';

type PageInput = Parameters<CardcomClient['createPaymentPage']>[0];
type ChargeInput = Parameters<CardcomClient['chargeToken']>[0];

/** Cardcom as its API answers: payment pages, their results, token charges and lookups. */
class FakeCardcom {
  pages = new Map<string, { input: PageInput; result: CardcomPageResult }>();
  resultCalls: string[] = [];
  charges: ChargeInput[] = [];
  /** What the next token charges answer (APPROVED by default). */
  chargeAnswers: Array<CardcomCharge | 'UNAVAILABLE'> = [];
  /** Charges Cardcom has on record, by ExternalUniqTranId. */
  onRecord = new Map<string, CardcomCharge>();
  failCreate = false;
  unavailable = false;
  private nextTransaction = 5000;

  isConfigured() {
    return true;
  }

  async createPaymentPage(input: PageInput) {
    if (this.failCreate) throw new CardcomUnavailableError('Cardcom LowProfile/Create could not be reached');
    const lowProfileId = randomUUID();
    this.pages.set(lowProfileId, {
      input,
      result: { paid: false, description: 'Not paid yet', terminalNumber: 1000, returnValue: input.returnValue, transactionId: null, amount: null, currency: null, token: null },
    });
    return { lowProfileId, url: `https://secure.cardcom.solutions/pay/${lowProfileId}` };
  }

  /** The card holder paid on the page. */
  pay(lowProfileId: string, overrides: Partial<CardcomPageResult> = {}) {
    const page = this.pages.get(lowProfileId);
    if (!page) throw new Error('no such page');
    page.result = {
      paid: true,
      description: 'OK',
      terminalNumber: 1000,
      returnValue: page.input.returnValue,
      transactionId: String(this.nextTransaction++),
      amount: page.input.amount,
      currency: 'ILS',
      token: { token: randomUUID(), cardExpiryMMYY: '0329', expiresAt: new Date(Date.UTC(2029, 11, 31)) },
      ...overrides,
    };
  }

  async getPaymentPageResult(lowProfileId: string) {
    this.resultCalls.push(lowProfileId);
    if (this.unavailable) throw new CardcomUnavailableError('Cardcom LowProfile/GetLpResult could not be reached');
    const page = this.pages.get(lowProfileId);
    if (!page) return { paid: false, description: 'Unknown', terminalNumber: 1000, returnValue: null, transactionId: null, amount: null, currency: null, token: null };
    return page.result;
  }

  async chargeToken(input: ChargeInput): Promise<CardcomCharge> {
    this.charges.push(input);
    const answer = this.chargeAnswers.shift() ?? { status: 'APPROVED', transactionId: null, amount: input.amount, currency: 'ILS', description: 'OK' };
    if (answer === 'UNAVAILABLE') {
      // The charge went through at Cardcom, but the answer never arrived.
      this.onRecord.set(input.externalUniqTranId, { status: 'APPROVED', transactionId: String(this.nextTransaction++), amount: input.amount, currency: 'ILS', description: 'OK' });
      throw new CardcomUnavailableError('Cardcom Transactions/Transaction could not be reached');
    }
    if (this.onRecord.has(input.externalUniqTranId)) {
      return { status: 'DUPLICATE', transactionId: null, amount: null, currency: null, description: 'Duplicate' };
    }
    const settled = answer.status === 'APPROVED' ? { ...answer, transactionId: answer.transactionId ?? String(this.nextTransaction++) } : answer;
    if (settled.status === 'APPROVED') this.onRecord.set(input.externalUniqTranId, settled);
    return settled;
  }

  async findTransaction(externalUniqTranId: string) {
    return this.onRecord.get(externalUniqTranId) ?? null;
  }
}

describe('card payments through Cardcom', () => {
  let t: TestApp;
  const cardcom = new FakeCardcom();

  beforeAll(async () => {
    t = await createTestApp({
      env: { PAYMENTS_PROVIDER: 'cardcom', CARDCOM_TERMINAL_NUMBER: '1000', CARDCOM_API_NAME: 'test-api', API_PUBLIC_URL: PUBLIC_URL },
      configure: (b) => b.overrideProvider(CardcomClient).useValue(cardcom),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  const checkout = (user: TestUser, planCode = 'DESIGNER_PREMIUM_QUARTERLY') =>
    t.http.post(`${API}/subscriptions/checkout`).set(user.auth).send({ planCode });
  const webhook = (body: unknown) => t.http.post(`${API}/webhooks/cardcom`).send(body as object);
  const live = (user: TestUser) =>
    t.prisma.subscription.findMany({ where: { userId: user.id, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } }, include: { plan: true } });
  const sweep = (now = new Date()) => t.app.get(SubscriptionLifecycleService).runOnce(now);

  /** A designer who paid for the quarterly plan on the Cardcom page. */
  async function paidDesigner() {
    const user = await registerVerified(t);
    const started = (await checkout(user).expect(201)).body.data;
    const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
    cardcom.pay(session.providerRef as string);
    await webhook({ LowProfileId: session.providerRef, ResponseCode: 0 }).expect(200);
    const [sub] = await live(user);
    return { user, session, sub };
  }

  describe('buying a plan', () => {
    it('opens a Cardcom payment page for the plan, its exact price, and this checkout', async () => {
      const user = await registerVerified(t);
      const res = await checkout(user).expect(201);
      const view = res.body.data;
      expect(view).toMatchObject({ planCode: 'DESIGNER_PREMIUM_QUARTERLY', amount: 45, currency: 'ILS', provider: 'cardcom', status: 'OPEN' });
      expect(view.paymentUrl).toMatch(/^https:\/\/secure\.cardcom\.solutions\/pay\//);

      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: view.id } });
      expect(session).toMatchObject({ provider: 'cardcom', paymentUrl: view.paymentUrl });
      const page = cardcom.pages.get(session.providerRef as string);
      expect(page?.input).toMatchObject({
        amount: 45,
        currency: 'ILS',
        returnValue: view.id,
        webhookUrl: `${PUBLIC_URL}/api/v1/webhooks/cardcom`,
        successUrl: `${PUBLIC_URL}/api/v1/payments/cardcom/return?checkout=${view.id}&result=success`,
        failedUrl: `${PUBLIC_URL}/api/v1/payments/cardcom/return?checkout=${view.id}&result=failed`,
        cancelUrl: `${PUBLIC_URL}/api/v1/payments/cardcom/return?checkout=${view.id}&result=cancel`,
        productName: 'מעצב/ת - פרימיום רבעוני',
        customer: { email: expect.stringContaining('@') },
      });
    });

    it('each attempt gets its own page (one page belongs to one checkout)', async () => {
      const user = await registerVerified(t);
      const first = (await checkout(user).expect(201)).body.data;
      const second = (await checkout(user).expect(201)).body.data;
      expect(second.id).not.toBe(first.id);
      expect(second.paymentUrl).not.toBe(first.paymentUrl);
    });

    it('when Cardcom cannot open a page, the purchase is refused for now and leaves nothing open', async () => {
      const user = await registerVerified(t);
      cardcom.failCreate = true;
      try {
        const res = await checkout(user).expect(503);
        expect(res.body.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      } finally {
        cardcom.failCreate = false;
      }
      expect(await t.prisma.checkoutSession.count({ where: { userId: user.id, status: 'OPEN' } })).toBe(0);
    });
  });

  describe("Cardcom's notification (webhook)", () => {
    it('activates the plan only after Cardcom itself confirms the payment, and keeps the card for renewals', async () => {
      const { user, session, sub } = await paidDesigner();
      expect(cardcom.resultCalls).toContain(session.providerRef);
      expect(sub).toMatchObject({ status: 'ACTIVE', billingCycle: 'QUARTERLY', plan: { code: 'DESIGNER_PREMIUM_QUARTERLY' } });
      expect(Number(sub.price)).toBe(45);
      expect(sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()).toBe(QUARTER_MS);

      const paid = cardcom.pages.get(session.providerRef as string)?.result;
      const invoices = await t.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: sub.id } });
      expect(invoices.map((invoice) => invoice.providerInvoiceId)).toEqual([paid?.transactionId]);
      const method = await t.prisma.paymentMethod.findUniqueOrThrow({ where: { id: sub.paymentMethodId as string } });
      expect(method).toMatchObject({ userId: user.id, provider: 'cardcom', token: paid?.token?.token, cardExpiry: '0329' });
      expect((await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('COMPLETED');
    });

    it('the same notification twice applies the payment once', async () => {
      const { user, session, sub } = await paidDesigner();
      await webhook({ LowProfileId: session.providerRef }).expect(200);
      expect(await live(user)).toHaveLength(1);
      expect(await t.prisma.subscriptionInvoice.count({ where: { subscriptionId: sub.id } })).toBe(1);
      expect(await t.prisma.paymentMethod.count({ where: { userId: user.id } })).toBe(1);
    });

    it('a notification that claims a payment Cardcom does not confirm activates nothing', async () => {
      const user = await registerVerified(t);
      const started = (await checkout(user).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      await webhook({ LowProfileId: session.providerRef, ResponseCode: 0, TranzactionInfo: { ResponseCode: 0, Amount: 45 } }).expect(200);
      expect(await live(user)).toHaveLength(0);
      expect((await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } })).status).toBe('OPEN');
    });

    it('a paid amount other than the price is kept for review, not activated', async () => {
      const user = await registerVerified(t);
      const started = (await checkout(user).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      cardcom.pay(session.providerRef as string, { amount: 1 });
      await webhook({ LowProfileId: session.providerRef }).expect(200);
      expect(await live(user)).toHaveLength(0);
      const event = await t.prisma.paymentEvent.findFirstOrThrow({ where: { checkoutId: started.id } });
      expect(event.outcome).toBe('NEEDS_REVIEW');
    });

    it("a confirmed payment for another checkout than the page's is kept for review", async () => {
      const user = await registerVerified(t);
      const started = (await checkout(user).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      cardcom.pay(session.providerRef as string, { returnValue: randomUUID() });
      await webhook({ LowProfileId: session.providerRef }).expect(200);
      expect(await live(user)).toHaveLength(0);
      expect((await t.prisma.paymentEvent.findFirstOrThrow({ where: { checkoutId: started.id } })).outcome).toBe('NEEDS_REVIEW');
    });

    it('a page this platform did not open is acknowledged and ignored (Cardcom is not asked)', async () => {
      const unknown = randomUUID();
      await webhook({ LowProfileId: unknown }).expect(200);
      expect(cardcom.resultCalls).not.toContain(unknown);
    });

    it('a notification without a page id is refused', async () => {
      await webhook({ ResponseCode: 0 }).expect(400);
      await webhook({ LowProfileId: 'not-a-guid' }).expect(400);
    });

    it('when Cardcom cannot be asked, the notification is refused (so Cardcom sends it again) and nothing changes', async () => {
      const user = await registerVerified(t);
      const started = (await checkout(user).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      cardcom.pay(session.providerRef as string);
      cardcom.unavailable = true;
      try {
        await webhook({ LowProfileId: session.providerRef }).expect(503);
      } finally {
        cardcom.unavailable = false;
      }
      expect(await live(user)).toHaveLength(0);
      await webhook({ LowProfileId: session.providerRef }).expect(200);
      expect(await live(user)).toHaveLength(1);
    });
  });

  describe('coming back to the app', () => {
    it('the return page confirms the payment with Cardcom even before its notification arrives', async () => {
      const user = await registerVerified(t);
      const started = (await checkout(user).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      cardcom.pay(session.providerRef as string);

      const page = await t.http.get(`${API}/payments/cardcom/return`).query({ checkout: started.id, result: 'success' }).expect(200);
      expect(page.headers['content-type']).toMatch(/text\/html/);
      expect(page.text).toContain('התשלום התקבל');
      expect(await live(user)).toHaveLength(1);
    });

    it('a failed or cancelled payment says so and changes nothing', async () => {
      const user = await registerVerified(t);
      const started = (await checkout(user).expect(201)).body.data;
      const failed = await t.http.get(`${API}/payments/cardcom/return`).query({ checkout: started.id, result: 'failed' }).expect(200);
      expect(failed.text).toContain('התשלום לא הושלם');
      expect(await live(user)).toHaveLength(0);
    });

    it('the buyer follows their checkout; nobody else can', async () => {
      const user = await registerVerified(t);
      const started = (await checkout(user).expect(201)).body.data;
      const session = await t.prisma.checkoutSession.findUniqueOrThrow({ where: { id: started.id } });
      expect((await t.http.get(`${API}/subscriptions/checkout/${started.id}`).set(user.auth).expect(200)).body.data.status).toBe('OPEN');

      cardcom.pay(session.providerRef as string);
      const after = await t.http.get(`${API}/subscriptions/checkout/${started.id}`).set(user.auth).expect(200);
      expect(after.body.data.status).toBe('COMPLETED');

      const stranger = await registerVerified(t);
      await t.http.get(`${API}/subscriptions/checkout/${started.id}`).set(stranger.auth).expect(404);
    });

    it('the saved card is never part of what the app receives', async () => {
      const { user, sub } = await paidDesigner();
      const method = await t.prisma.paymentMethod.findUniqueOrThrow({ where: { id: sub.paymentMethodId as string } });
      const me = await t.http.get(`${API}/subscriptions/me`).set(user.auth).expect(200);
      expect(JSON.stringify(me.body)).not.toContain(method.token);
      const session = await t.prisma.checkoutSession.findFirstOrThrow({ where: { userId: user.id } });
      const view = await t.http.get(`${API}/subscriptions/checkout/${session.id}`).set(user.auth).expect(200);
      expect(JSON.stringify(view.body)).not.toContain(method.token);
    });
  });

  describe('renewals (the saved card is charged at the end of each period)', () => {
    async function endPeriod(subscriptionId: string) {
      const ended = new Date(Date.now() - 60_000);
      await t.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { currentPeriodStart: new Date(ended.getTime() - QUARTER_MS), currentPeriodEnd: ended },
      });
      return ended;
    }

    /** The period ends at `end` (renewals are charged in its last 12 hours). */
    async function periodEndingAt(subscriptionId: string, end: Date) {
      await t.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { currentPeriodStart: new Date(end.getTime() - QUARTER_MS), currentPeriodEnd: end },
      });
      return end;
    }

    it('charges the agreed price once, in the last hours of the period, and the next period starts where it ends', async () => {
      const { sub } = await paidDesigner();
      const ended = await periodEndingAt(sub.id, new Date(Date.now() + 60 * 60 * 1000));
      const before = cardcom.charges.length;
      await sweep();
      await sweep();

      const charges = cardcom.charges.slice(before);
      expect(charges).toHaveLength(1);
      const method = await t.prisma.paymentMethod.findUniqueOrThrow({ where: { id: sub.paymentMethodId as string } });
      expect(charges[0]).toMatchObject({ token: method.token, cardExpiryMMYY: '0329', amount: 45, currency: 'ILS' });
      expect(charges[0].externalUniqTranId).toBe(`renewal:${sub.id}:${Math.floor(ended.getTime() / 1000)}:0`);

      const renewed = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(renewed.status).toBe('ACTIVE');
      expect(renewed.currentPeriodEnd.getTime()).toBe(ended.getTime() + QUARTER_MS);
      expect(await t.prisma.subscriptionInvoice.count({ where: { subscriptionId: sub.id } })).toBe(2);
    });

    it('a declined card makes the plan past due, and is tried again only a day later', async () => {
      const { sub } = await paidDesigner();
      const ended = await endPeriod(sub.id);
      const before = cardcom.charges.length;
      cardcom.chargeAnswers.push({ status: 'DECLINED', transactionId: null, amount: null, currency: null, description: 'Card declined' });
      await sweep();
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('PAST_DUE');

      await sweep(new Date(Date.now() + 60 * 60 * 1000));
      expect(cardcom.charges.length - before).toBe(1);

      await sweep(new Date(Date.now() + DAY_MS + 60_000));
      const charges = cardcom.charges.slice(before);
      expect(charges).toHaveLength(2);
      expect(charges[1].externalUniqTranId).toBe(`renewal:${sub.id}:${Math.floor(ended.getTime() / 1000)}:1`);
      const renewed = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(renewed.status).toBe('ACTIVE');
    });

    it('when the answer to a charge is lost, the next sweep finds the charge instead of charging again', async () => {
      const { sub } = await paidDesigner();
      await endPeriod(sub.id);
      const before = cardcom.charges.length;
      cardcom.chargeAnswers.push('UNAVAILABLE');
      await sweep();
      // Unknown outcome: no decision yet (not past due for a payment that may have gone through).
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).not.toBe('ACTIVE');
      await sweep();
      expect(cardcom.charges.length - before).toBe(1);
      const renewed = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(renewed.status).toBe('ACTIVE');
      expect(await t.prisma.subscriptionInvoice.count({ where: { subscriptionId: sub.id } })).toBe(2);
    });

    it('a plan cancelled by its owner is not charged again; it ends with its period', async () => {
      const { user, sub } = await paidDesigner();
      await t.http.post(`${API}/subscriptions/cancel`).set(user.auth).expect(201);
      await endPeriod(sub.id);
      const before = cardcom.charges.length;
      await sweep();
      expect(cardcom.charges.length).toBe(before);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('CANCELLED');
    });

    it('nothing is charged before the last 12 hours of the period', async () => {
      const { sub } = await paidDesigner();
      const before = cardcom.charges.length;
      await sweep();
      expect(cardcom.charges.length).toBe(before);
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('ACTIVE');
    });
  });

  it('jewelry payments, which have no Cardcom integration, stay closed', async () => {
    const user = await registerVerified(t);
    const res = await t.http.post(`${API}/jewelry-payments/intents`).set(user.auth).send({ quoteId: randomUUID() });
    expect([403, 404, 503]).toContain(res.status);
    if (res.status === 503) expect(res.body.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
  });
});
