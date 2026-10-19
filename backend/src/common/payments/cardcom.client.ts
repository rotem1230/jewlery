import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Cardcom answers within seconds; a slower call is treated as unavailable (and retried). */
const REQUEST_TIMEOUT_MS = 30_000;
/** Cardcom's code for a transaction whose ExternalUniqTranId was already used. */
const DUPLICATE_UNIQUE_ID = 608;
/** Cardcom's coin ids: 1 = ILS, 2 = USD, otherwise the ISO 4217 number. */
const COINS: Record<number, string> = { 1: 'ILS', 2: 'USD', 376: 'ILS', 840: 'USD' };
const COIN_IDS: Record<string, number> = { ILS: 1, USD: 2 };
/** Document fields Cardcom limits to 50 characters. */
const DOCUMENT_FIELD_MAX = 50;
const PRODUCT_DESCRIPTION_MAX = 250;

export type CardcomCustomer = { name: string; email?: string | null };

export type CardcomPaymentPage = { lowProfileId: string; url: string };

export type CardcomToken = { token: string; cardExpiryMMYY: string; expiresAt: Date | null };

export type CardcomPageResult = {
  /** The card was charged: the deal and its transaction both succeeded. */
  paid: boolean;
  description: string;
  terminalNumber: number | null;
  /** What was sent as ReturnValue (the checkout id). */
  returnValue: string | null;
  transactionId: string | null;
  amount: number | null;
  /** Null for a coin this platform does not know. */
  currency: string | null;
  token: CardcomToken | null;
};

export type CardcomCharge = {
  status: 'APPROVED' | 'DECLINED' | 'DUPLICATE';
  transactionId: string | null;
  amount: number | null;
  currency: string | null;
  description: string;
};

/** Cardcom refused the request itself (a developer or configuration error, e.g. a wrong terminal). */
export class CardcomRequestError extends Error {
  constructor(
    readonly code: number,
    description: string,
  ) {
    super(`Cardcom refused the request (${code}): ${description}`);
  }
}

/** Cardcom could not be reached or failed: the outcome is unknown and the call may be retried. */
export class CardcomUnavailableError extends Error {}

type Json = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function record(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

/** "20291231" → 2029-12-31 (UTC); anything else → null. */
function tokenExpiry(value: unknown): Date | null {
  const raw = text(value);
  const match = raw ? /^(\d{4})(\d{2})(\d{2})$/.exec(raw) : null;
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

/** Card month 3 and year 2029 (or 29) → "0329", the MMYY a token charge asks for. */
function expiryMMYY(month: unknown, year: unknown): string | null {
  const m = num(month);
  const y = num(year);
  if (m === null || y === null || m < 1 || m > 12) return null;
  return `${String(m).padStart(2, '0')}${String(y % 100).padStart(2, '0')}`;
}

/**
 * Cardcom API v11 (secure.cardcom.solutions, as its OpenAPI document defines it): the hosted payment
 * page, the result of a deal, token charges for renewals and the lookup of a charge by its unique
 * id. Authenticated by the terminal number and API name in each body; nothing here is logged.
 */
@Injectable()
export class CardcomClient {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const terminal = this.config.get<number>('cardcom.terminalNumber');
    return typeof terminal === 'number' && terminal > 0 && Boolean(this.config.get<string>('cardcom.apiName'));
  }

  /** A payment page that charges the amount and keeps a token for the renewals (ChargeAndCreateToken). */
  async createPaymentPage(input: {
    amount: number;
    currency: string;
    returnValue: string;
    successUrl: string;
    failedUrl: string;
    cancelUrl: string;
    webhookUrl: string;
    productName: string;
    customer: CardcomCustomer;
  }): Promise<CardcomPaymentPage> {
    const body: Json = {
      ...this.auth(),
      Operation: 'ChargeAndCreateToken',
      ReturnValue: input.returnValue,
      Amount: input.amount,
      ...this.coinId(input.currency),
      Language: 'he',
      SuccessRedirectUrl: input.successUrl,
      FailedRedirectUrl: input.failedUrl,
      CancelRedirectUrl: input.cancelUrl,
      WebHookUrl: input.webhookUrl,
      ProductName: input.productName.slice(0, PRODUCT_DESCRIPTION_MAX),
      AdvancedDefinition: { MaxNumOfPayments: 1, ...this.coinName(input.currency) },
    };
    const document = this.document(input.amount, input.productName, input.customer);
    if (document) body.Document = document;

    const res = await this.post('LowProfile/Create', body);
    const code = num(res.ResponseCode);
    const lowProfileId = text(res.LowProfileId);
    const url = text(res.Url);
    if (code !== 0 || !lowProfileId || !url) {
      throw new CardcomRequestError(code ?? -1, text(res.Description) ?? 'No payment page was returned');
    }
    return { lowProfileId, url };
  }

  /** The result of a payment page deal, read from Cardcom itself (never from what a client says). */
  async getPaymentPageResult(lowProfileId: string): Promise<CardcomPageResult> {
    const res = await this.post('LowProfile/GetLpResult', { ...this.auth(), LowProfileId: lowProfileId });
    const transaction = record(res.TranzactionInfo);
    const token = record(res.TokenInfo);
    const tokenValue = text(token?.Token);
    const cardExpiry = expiryMMYY(token?.CardMonth, token?.CardYear);
    const coin = num(transaction?.CoinId);
    return {
      paid: num(res.ResponseCode) === 0 && transaction !== null && num(transaction.ResponseCode) === 0,
      description: text(res.Description) ?? '',
      terminalNumber: num(res.TerminalNumber),
      returnValue: text(res.ReturnValue),
      transactionId: this.id(transaction?.TranzactionId ?? res.TranzactionId),
      amount: num(transaction?.Amount),
      currency: coin === null ? null : (COINS[coin] ?? null),
      token: tokenValue && cardExpiry ? { token: tokenValue, cardExpiryMMYY: cardExpiry, expiresAt: tokenExpiry(token?.TokenExDate) } : null,
    };
  }

  /** Charges a saved token once per `externalUniqTranId` (Cardcom refuses a repeat with 608). */
  async chargeToken(input: {
    token: string;
    cardExpiryMMYY: string;
    amount: number;
    currency: string;
    externalUniqTranId: string;
    productName: string;
    customer: CardcomCustomer;
  }): Promise<CardcomCharge> {
    const body: Json = {
      ...this.auth(),
      Amount: input.amount,
      Token: input.token,
      CardExpirationMMYY: input.cardExpiryMMYY,
      ExternalUniqTranId: input.externalUniqTranId,
      NumOfPayments: 1,
      ...this.coinId(input.currency),
    };
    const coinName = this.coinName(input.currency);
    if (coinName.ISOCoinName) body.Advanced = coinName;
    const document = this.document(input.amount, input.productName, input.customer);
    if (document) body.Document = document;
    return this.charge(await this.post('Transactions/Transaction', body));
  }

  /** The approved charge sent with this unique id, or null when there is none. */
  async findTransaction(externalUniqTranId: string): Promise<CardcomCharge | null> {
    const res = await this.post('Transactions/GetTransactionByExternalUniqTran', {
      ...this.auth(),
      ExternalUniqTranId: externalUniqTranId,
    });
    const charge = this.charge(res);
    return charge.status === 'APPROVED' ? charge : null;
  }

  private charge(res: Json): CardcomCharge {
    const code = num(res.ResponseCode);
    const coin = num(res.CoinId);
    return {
      status: code === 0 ? 'APPROVED' : code === DUPLICATE_UNIQUE_ID ? 'DUPLICATE' : 'DECLINED',
      transactionId: code === 0 ? this.id(res.TranzactionId) : null,
      amount: code === 0 ? num(res.Amount) : null,
      currency: code === 0 && coin !== null ? (COINS[coin] ?? null) : null,
      description: text(res.Description) ?? '',
    };
  }

  private id(value: unknown): string | null {
    const n = num(value);
    return n !== null && n > 0 ? String(n) : null;
  }

  private auth(): Json {
    return { TerminalNumber: this.config.get<number>('cardcom.terminalNumber'), ApiName: this.config.get<string>('cardcom.apiName') };
  }

  /** ILS and USD by Cardcom's coin id; any other currency by its ISO name (in the advanced options). */
  private coinId(currency: string): Json {
    const id = COIN_IDS[currency.toUpperCase()];
    return id ? { ISOCoinId: id } : {};
  }

  private coinName(currency: string): Json {
    return COIN_IDS[currency.toUpperCase()] ? {} : { ISOCoinName: currency.toUpperCase() };
  }

  /** The tax document (invoice / receipt) for the charge, when the terminal makes documents. */
  private document(amount: number, productName: string, customer: CardcomCustomer): Json | null {
    if (this.config.get<boolean>('cardcom.documents') === false) return null;
    const email = customer.email?.trim() || null;
    return {
      Name: (customer.name.trim() || email || 'לקוח').slice(0, DOCUMENT_FIELD_MAX),
      ...(email ? { Email: email.slice(0, DOCUMENT_FIELD_MAX), IsSendByEmail: true } : {}),
      Products: [{ Description: productName.slice(0, PRODUCT_DESCRIPTION_MAX), UnitCost: amount, Quantity: 1 }],
    };
  }

  private async post(path: string, body: Json): Promise<Json> {
    const base = (this.config.get<string>('cardcom.baseUrl') || 'https://secure.cardcom.solutions').replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/api/v11/${path}`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new CardcomUnavailableError(`Cardcom ${path} could not be reached: ${(err as Error).message}`);
    }
    if (res.status >= 500) {
      throw new CardcomUnavailableError(`Cardcom ${path} failed with HTTP ${res.status}`);
    }
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new CardcomUnavailableError(`Cardcom ${path} answered HTTP ${res.status} without JSON`);
    }
    const answer = record(parsed);
    if (!answer) {
      throw new CardcomUnavailableError(`Cardcom ${path} answered HTTP ${res.status} with an unexpected body`);
    }
    // 400 / 401 carry Cardcom's ErrorInfo: a refusal of the request, not an outage.
    if (!res.ok) {
      throw new CardcomRequestError(num(answer.ResponseCode) ?? res.status, text(answer.Description) ?? `HTTP ${res.status}`);
    }
    return answer;
  }
}
