import { randomUUID } from 'crypto';
import {
  CardcomCharge,
  CardcomClient,
  CardcomPageResult,
  CardcomRefund,
  CardcomUnavailableError,
} from '../../src/common/payments/cardcom.client';

type PageInput = Parameters<CardcomClient['createPaymentPage']>[0];
type ChargeInput = Parameters<CardcomClient['chargeToken']>[0];
type RefundInput = Parameters<CardcomClient['refund']>[0];

const NOT_PAID = (returnValue: string | null): CardcomPageResult => ({
  paid: false,
  tokenSaved: false,
  cardLast4: null,
  description: 'Not paid yet',
  terminalNumber: 1000,
  returnValue,
  transactionId: null,
  amount: null,
  currency: null,
  token: null,
});

/**
 * Cardcom as its API answers (secure.cardcom.solutions/swagger/v11): payment pages and their
 * results, token charges with their unique ids, lookups and refunds.
 */
export class FakeCardcom {
  pages = new Map<string, { input: PageInput; result: CardcomPageResult }>();
  resultCalls: string[] = [];
  charges: ChargeInput[] = [];
  /** What the next token charges answer (APPROVED by default). */
  chargeAnswers: Array<CardcomCharge | 'UNAVAILABLE'> = [];
  /** Charges Cardcom has on record, by ExternalUniqTranId. */
  onRecord = new Map<string, CardcomCharge>();
  refunds: RefundInput[] = [];
  /** What the next refunds answer (REFUNDED by default). */
  refundAnswers: Array<CardcomRefund | 'UNAVAILABLE'> = [];
  failCreate = false;
  unavailable = false;
  refundsEnabled = true;
  private nextTransaction = 5000;

  isConfigured() {
    return true;
  }

  canRefund() {
    return this.refundsEnabled;
  }

  async createPaymentPage(input: PageInput) {
    if (this.failCreate) throw new CardcomUnavailableError('Cardcom LowProfile/Create could not be reached');
    const lowProfileId = randomUUID();
    this.pages.set(lowProfileId, { input, result: NOT_PAID(input.returnValue) });
    return { lowProfileId, url: `https://secure.cardcom.solutions/pay/${lowProfileId}` };
  }

  /** The card holder paid on the page (a token is saved unless the page only charges). */
  pay(lowProfileId: string, overrides: Partial<CardcomPageResult> = {}) {
    const page = this.pages.get(lowProfileId);
    if (!page) throw new Error('no such page');
    const operation = page.input.operation ?? 'ChargeAndCreateToken';
    const token = operation === 'ChargeOnly' ? null : { token: randomUUID(), cardExpiryMMYY: '0329', expiresAt: new Date(Date.UTC(2029, 11, 31)) };
    const charged = operation !== 'CreateTokenOnly';
    page.result = {
      paid: charged,
      tokenSaved: token !== null,
      cardLast4: charged ? '4580' : null,
      description: 'OK',
      terminalNumber: 1000,
      returnValue: page.input.returnValue,
      transactionId: charged ? String(this.nextTransaction++) : null,
      amount: charged ? page.input.amount : null,
      currency: charged ? 'ILS' : null,
      token,
      ...overrides,
    };
  }

  async getPaymentPageResult(lowProfileId: string) {
    this.resultCalls.push(lowProfileId);
    if (this.unavailable) throw new CardcomUnavailableError('Cardcom LowProfile/GetLpResult could not be reached');
    const page = this.pages.get(lowProfileId);
    return page ? page.result : { ...NOT_PAID(null), description: 'Unknown' };
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
    const settled = answer.status === 'APPROVED' ? { ...answer, amount: input.amount, transactionId: answer.transactionId ?? String(this.nextTransaction++) } : answer;
    if (settled.status === 'APPROVED') this.onRecord.set(input.externalUniqTranId, settled);
    return settled;
  }

  async findTransaction(externalUniqTranId: string) {
    return this.onRecord.get(externalUniqTranId) ?? null;
  }

  async refund(input: RefundInput): Promise<CardcomRefund> {
    this.refunds.push(input);
    const answer = this.refundAnswers.shift() ?? { status: 'REFUNDED', refundTransactionId: String(this.nextTransaction++), description: 'OK' };
    if (answer === 'UNAVAILABLE') throw new CardcomUnavailableError('Cardcom Transactions/RefundByTransactionId could not be reached');
    return answer;
  }
}
