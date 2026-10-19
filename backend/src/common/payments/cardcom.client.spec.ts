import { ConfigService } from '@nestjs/config';
import { CardcomClient, CardcomRequestError, CardcomUnavailableError } from './cardcom.client';

/**
 * The Cardcom API v11 calls, as its OpenAPI document (secure.cardcom.solutions/swagger/v11) defines
 * them: LowProfile/Create (payment page), LowProfile/GetLpResult (the deal's result),
 * Transactions/Transaction (token charge) and Transactions/GetTransactionByExternalUniqTran.
 */
describe('CardcomClient', () => {
  const settings: Record<string, unknown> = {
    'cardcom.terminalNumber': 1000,
    'cardcom.apiName': 'api-name',
    'cardcom.baseUrl': 'https://secure.cardcom.solutions',
    'cardcom.documents': true,
  };
  const client = (overrides: Record<string, unknown> = {}) =>
    new CardcomClient({ get: (key: string) => ({ ...settings, ...overrides })[key] } as unknown as ConfigService);

  let calls: Array<{ url: string; body: Record<string, unknown> }>;
  let reply: () => Promise<Response>;
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  beforeEach(() => {
    calls = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
      return reply();
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const page = {
    amount: 45,
    currency: 'ILS',
    returnValue: '6f0b5c1e-1111-4222-8333-444455556666',
    successUrl: 'https://api.example.com/api/v1/payments/cardcom/return?result=success',
    failedUrl: 'https://api.example.com/api/v1/payments/cardcom/return?result=failed',
    cancelUrl: 'https://api.example.com/api/v1/payments/cardcom/return?result=cancel',
    webhookUrl: 'https://api.example.com/api/v1/webhooks/cardcom',
    productName: 'מעצב/ת - פרימיום רבעוני',
    customer: { name: 'דנה כהן', email: 'dana@example.com' },
  };

  it('is configured only with a terminal number and an API name', () => {
    expect(client().isConfigured()).toBe(true);
    expect(client({ 'cardcom.terminalNumber': undefined }).isConfigured()).toBe(false);
    expect(client({ 'cardcom.apiName': '' }).isConfigured()).toBe(false);
  });

  describe('payment page (LowProfile/Create)', () => {
    it('asks for a charge that also keeps a token, in Hebrew and shekels, with the receipt document', async () => {
      reply = () => json({ ResponseCode: 0, LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', Url: 'https://secure.cardcom.solutions/EA/EA5/abc' });
      const created = await client().createPaymentPage(page);

      expect(created).toEqual({ lowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', url: 'https://secure.cardcom.solutions/EA/EA5/abc' });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://secure.cardcom.solutions/api/v11/LowProfile/Create');
      expect(calls[0].body).toMatchObject({
        TerminalNumber: 1000,
        ApiName: 'api-name',
        Operation: 'ChargeAndCreateToken',
        ReturnValue: page.returnValue,
        Amount: 45,
        ISOCoinId: 1,
        Language: 'he',
        SuccessRedirectUrl: page.successUrl,
        FailedRedirectUrl: page.failedUrl,
        CancelRedirectUrl: page.cancelUrl,
        WebHookUrl: page.webhookUrl,
        ProductName: page.productName,
        Document: {
          Name: 'דנה כהן',
          Email: 'dana@example.com',
          IsSendByEmail: true,
          Products: [{ Description: page.productName, UnitCost: 45, Quantity: 1 }],
        },
      });
      // One payment: no instalments are offered for a subscription.
      expect(calls[0].body.AdvancedDefinition).toMatchObject({ MaxNumOfPayments: 1 });
    });

    it('without documents enabled, no receipt is asked for', async () => {
      reply = () => json({ ResponseCode: 0, LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', Url: 'https://x' });
      await client({ 'cardcom.documents': false }).createPaymentPage(page);
      expect(calls[0].body.Document).toBeUndefined();
    });

    it('a long customer name is cut to the 50 characters a document allows', async () => {
      reply = () => json({ ResponseCode: 0, LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', Url: 'https://x' });
      await client().createPaymentPage({ ...page, customer: { name: 'א'.repeat(80), email: 'dana@example.com' } });
      expect((calls[0].body.Document as { Name: string }).Name).toHaveLength(50);
    });

    it('a refusal by Cardcom (non-zero ResponseCode) is an error with its description', async () => {
      reply = () => json({ ResponseCode: 5033, Description: 'Invalid terminal' });
      await expect(client().createPaymentPage(page)).rejects.toThrow(CardcomRequestError);
      await expect(client().createPaymentPage(page)).rejects.toThrow('Invalid terminal');
    });

    it('a network failure or a server error is reported as unavailable (to retry), never as a refusal', async () => {
      reply = () => json({ Message: 'oops' }, 503);
      await expect(client().createPaymentPage(page)).rejects.toThrow(CardcomUnavailableError);
      reply = () => Promise.reject(new TypeError('fetch failed'));
      await expect(client().createPaymentPage(page)).rejects.toThrow(CardcomUnavailableError);
    });
  });

  describe('deal result (LowProfile/GetLpResult)', () => {
    const paid = {
      ResponseCode: 0,
      Description: 'OK',
      TerminalNumber: 1000,
      LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001',
      TranzactionId: 123456789,
      ReturnValue: page.returnValue,
      Operation: 'ChargeAndCreateToken',
      TranzactionInfo: { ResponseCode: 0, TranzactionId: 123456789, Amount: 45, CoinId: 1 },
      TokenInfo: { Token: 'b3a1c9e2-5555-4666-8777-888899990000', TokenExDate: '20291231', CardYear: 2029, CardMonth: 3 },
    };

    it('reads a paid deal: its transaction, amount, currency and the token for renewals', async () => {
      reply = () => json(paid);
      const result = await client().getPaymentPageResult('a1b2c3d4-0000-4000-8000-000000000001');
      expect(calls[0].url).toBe('https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult');
      expect(calls[0].body).toEqual({ TerminalNumber: 1000, ApiName: 'api-name', LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001' });
      expect(result).toEqual({
        paid: true,
        tokenSaved: true,
        cardLast4: null,
        description: 'OK',
        terminalNumber: 1000,
        returnValue: page.returnValue,
        transactionId: '123456789',
        amount: 45,
        currency: 'ILS',
        token: { token: 'b3a1c9e2-5555-4666-8777-888899990000', cardExpiryMMYY: '0329', expiresAt: new Date(Date.UTC(2029, 11, 31)) },
      });
    });

    it('a deal whose card charge failed is not paid', async () => {
      reply = () => json({ ...paid, TranzactionInfo: { ...paid.TranzactionInfo, ResponseCode: 33 } });
      expect((await client().getPaymentPageResult(paid.LowProfileId)).paid).toBe(false);
      reply = () => json({ ...paid, ResponseCode: 1, TranzactionInfo: null });
      expect((await client().getPaymentPageResult(paid.LowProfileId)).paid).toBe(false);
    });

    it('a currency it does not know is reported as unknown (the payment is then reviewed, not applied)', async () => {
      reply = () => json({ ...paid, TranzactionInfo: { ...paid.TranzactionInfo, CoinId: 978 } });
      expect((await client().getPaymentPageResult(paid.LowProfileId)).currency).toBeNull();
    });
  });

  describe('renewal charge (Transactions/Transaction with the token)', () => {
    const charge = {
      token: 'b3a1c9e2-5555-4666-8777-888899990000',
      cardExpiryMMYY: '0329',
      amount: 45,
      currency: 'ILS',
      externalUniqTranId: 'renewal:sub-1:1767225600:0',
      productName: 'מעצב/ת - פרימיום רבעוני',
      customer: { name: 'דנה כהן', email: 'dana@example.com' },
    };

    it('charges the token once per unique id, with the receipt document', async () => {
      reply = () => json({ ResponseCode: 0, Description: 'OK', TranzactionId: 987, Amount: 45, CoinId: 1 });
      const result = await client().chargeToken(charge);
      expect(calls[0].url).toBe('https://secure.cardcom.solutions/api/v11/Transactions/Transaction');
      expect(calls[0].body).toMatchObject({
        TerminalNumber: 1000,
        ApiName: 'api-name',
        Amount: 45,
        Token: charge.token,
        CardExpirationMMYY: '0329',
        ExternalUniqTranId: charge.externalUniqTranId,
        ISOCoinId: 1,
        NumOfPayments: 1,
        Document: { Name: 'דנה כהן', Email: 'dana@example.com', IsSendByEmail: true },
      });
      expect(result).toEqual({ status: 'APPROVED', transactionId: '987', amount: 45, currency: 'ILS', description: 'OK' });
    });

    it('a declined card is DECLINED; the same unique id sent again (608) is DUPLICATE', async () => {
      reply = () => json({ ResponseCode: 33, Description: 'Card declined' });
      expect(await client().chargeToken(charge)).toMatchObject({ status: 'DECLINED', description: 'Card declined', transactionId: null });
      reply = () => json({ ResponseCode: 608, Description: 'Duplicate' });
      expect((await client().chargeToken(charge)).status).toBe('DUPLICATE');
    });

    it('a timeout is unavailable (the outcome is unknown, so the caller must look it up before charging again)', async () => {
      reply = () => Promise.reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
      await expect(client().chargeToken(charge)).rejects.toThrow(CardcomUnavailableError);
    });
  });

  describe('looking up a charge by its unique id', () => {
    it('finds an approved charge, and nothing when there was none', async () => {
      reply = () => json({ ResponseCode: 0, TranzactionId: 987, Amount: 45, CoinId: 1, Description: 'OK' });
      expect(await client().findTransaction('renewal:sub-1:1767225600:0')).toEqual({
        status: 'APPROVED',
        transactionId: '987',
        amount: 45,
        currency: 'ILS',
        description: 'OK',
      });
      expect(calls[0].url).toBe('https://secure.cardcom.solutions/api/v11/Transactions/GetTransactionByExternalUniqTran');
      expect(calls[0].body).toEqual({ TerminalNumber: 1000, ApiName: 'api-name', ExternalUniqTranId: 'renewal:sub-1:1767225600:0' });

      reply = () => json({ ResponseCode: 1, Description: 'Not found' });
      expect(await client().findTransaction('renewal:sub-1:1767225600:1')).toBeNull();
    });
  });

  describe('other payment page operations', () => {
    it('saving a new card only (CreateTokenOnly): a J2 card check, no charge and no receipt', async () => {
      reply = () => json({ ResponseCode: 0, LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', Url: 'https://x' });
      await client().createPaymentPage({ ...page, operation: 'CreateTokenOnly' });
      expect(calls[0].body.Operation).toBe('CreateTokenOnly');
      expect(calls[0].body.Document).toBeUndefined();
      expect(calls[0].body.AdvancedDefinition).toEqual({ MaxNumOfPayments: 1, JValidateType: 2 });
    });

    it('a one-off charge with no saved card (ChargeOnly), with its receipt', async () => {
      reply = () => json({ ResponseCode: 0, LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', Url: 'https://x' });
      await client().createPaymentPage({ ...page, operation: 'ChargeOnly' });
      expect(calls[0].body.Operation).toBe('ChargeOnly');
      expect(calls[0].body.Document).toBeDefined();
    });

    it('a saved card from a token-only page is read (no transaction), with the last digits of a charged card', async () => {
      reply = () =>
        json({
          ResponseCode: 0,
          TerminalNumber: 1000,
          LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001',
          ReturnValue: 'upd-1',
          Operation: 'CreateTokenOnly',
          TokenInfo: { Token: 'c4c4c4c4-5555-4666-8777-888899990000', TokenExDate: '20301130', CardYear: 30, CardMonth: 11 },
        });
      const saved = await client().getPaymentPageResult('a1b2c3d4-0000-4000-8000-000000000001');
      expect(saved).toMatchObject({ paid: false, tokenSaved: true, cardLast4: null });
      expect(saved.token).toEqual({ token: 'c4c4c4c4-5555-4666-8777-888899990000', cardExpiryMMYY: '1130', expiresAt: new Date(Date.UTC(2030, 10, 30)) });

      reply = () =>
        json({
          ResponseCode: 0,
          TerminalNumber: 1000,
          LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001',
          ReturnValue: 'chk',
          TranzactionInfo: { ResponseCode: 0, TranzactionId: 1, Amount: 45, CoinId: 1, Last4CardDigitsString: '4580' },
        });
      expect((await client().getPaymentPageResult('a1b2c3d4-0000-4000-8000-000000000001')).cardLast4).toBe('4580');
    });

    it('a token-only page that failed saved nothing', async () => {
      reply = () => json({ ResponseCode: 3, Description: 'Card refused', TokenInfo: null });
      expect(await client().getPaymentPageResult('a1b2c3d4-0000-4000-8000-000000000001')).toMatchObject({ tokenSaved: false, token: null });
    });
  });

  describe('refunds (Transactions/RefundByTransactionId)', () => {
    const withPassword = { 'cardcom.apiPassword': 'api-password' };

    it('refunds a whole transaction with the API password, under the refund id', async () => {
      reply = () => json({ ResponseCode: 0, NewTranzactionId: 1001 });
      const result = await client(withPassword).refund({ transactionId: '987', externalRefundId: 'refund-1' });
      expect(calls[0].url).toBe('https://secure.cardcom.solutions/api/v11/Transactions/RefundByTransactionId');
      expect(calls[0].body).toEqual({
        ApiName: 'api-name',
        ApiPassword: 'api-password',
        TransactionId: 987,
        ExternalRefundDealId: 'refund-1',
        AllowMultipleRefunds: true,
      });
      expect(result).toEqual({ status: 'REFUNDED', refundTransactionId: '1001', description: '' });
    });

    it('a part of it with the partial sum', async () => {
      reply = () => json({ ResponseCode: 0, NewTranzactionId: 1002 });
      await client(withPassword).refund({ transactionId: '987', amount: 20, externalRefundId: 'refund-2' });
      expect(calls[0].body).toMatchObject({ PartialSum: 20 });
    });

    it('a refusal is REFUSED with its reason; without the API password there are no refunds', async () => {
      reply = () => json({ ResponseCode: 5001, Description: 'Already refunded' });
      expect(await client(withPassword).refund({ transactionId: '987', externalRefundId: 'r' })).toEqual({
        status: 'REFUSED',
        refundTransactionId: null,
        description: 'Already refunded',
      });
      expect(client().canRefund()).toBe(false);
      expect(client(withPassword).canRefund()).toBe(true);
      await expect(client().refund({ transactionId: '987', externalRefundId: 'r' })).rejects.toThrow(CardcomRequestError);
    });

    it('an unreachable Cardcom is unavailable (the refund may or may not have happened)', async () => {
      reply = () => Promise.reject(new TypeError('fetch failed'));
      await expect(client(withPassword).refund({ transactionId: '987', externalRefundId: 'r' })).rejects.toThrow(CardcomUnavailableError);
    });
  });

  it('a currency other than ILS / USD goes by its ISO name in the advanced options, keeping the single payment', async () => {
    reply = () => json({ ResponseCode: 0, LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', Url: 'https://x' });
    await client().createPaymentPage({ ...page, currency: 'EUR' });
    expect(calls[0].body.ISOCoinId).toBeUndefined();
    expect(calls[0].body.AdvancedDefinition).toEqual({ MaxNumOfPayments: 1, ISOCoinName: 'EUR' });

    reply = () => json({ ResponseCode: 0, TranzactionId: 1, Amount: 45, CoinId: 978 });
    await client().chargeToken({
      token: 't',
      cardExpiryMMYY: '0329',
      amount: 45,
      currency: 'EUR',
      externalUniqTranId: 'u',
      productName: 'p',
      customer: { name: 'n' },
    });
    expect(calls[1].body.ISOCoinId).toBeUndefined();
    expect(calls[1].body.Advanced).toEqual({ ISOCoinName: 'EUR' });
  });

  it('never sends the credentials anywhere but the configured Cardcom address', async () => {
    reply = () => json({ ResponseCode: 0, LowProfileId: 'a1b2c3d4-0000-4000-8000-000000000001', Url: 'https://x' });
    await client({ 'cardcom.baseUrl': 'https://secure.cardcom.solutions/' }).createPaymentPage(page);
    expect(calls.every((call) => call.url.startsWith('https://secure.cardcom.solutions/api/v11/'))).toBe(true);
  });
});
