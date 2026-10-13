import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentEvent, PlanCatalog, Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'crypto';
import { EventLogService } from '../audit/event-log.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { isTransientDatabaseError } from '../database/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { lockSubscription, lockUser } from '../database/row-locks';
import { billingCyclePeriodMs } from './billing-periods';
import { PaymentWebhookDto } from './dto/subscription.dto';
import { CheckoutService } from './checkout.service';
import { describeMoney, isExactPayment } from './money';
import { SubscriptionsService } from './subscriptions.service';
import { verifyWebhookSignature } from './webhook-signature';

type Tx = Prisma.TransactionClient;

export type PaymentOutcome = 'APPLIED' | 'IGNORED' | 'NEEDS_REVIEW';
export type AppliedEvent = { outcome: PaymentOutcome; note?: string; subscriptionId?: string | null };

type LockedSubscription = Subscription & { plan: PlanCatalog; user: { deletedAt: Date | null } };
type ParsedBody = { ok: true; dto: PaymentWebhookDto } | { ok: false; reason: string; body?: Record<string, unknown> };

const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];
const MAX_NOTE_LENGTH = 1_000;
const MAX_STORED_RAW_BODY = 64 * 1024;

function isDuplicateEvent(err: unknown): boolean {
  const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    JSON.stringify(target ?? '').includes('providerEventId')
  );
}

/** Lone UTF-16 surrogates (JSON allows them as escapes; PostgreSQL rejects them). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function storableText(text: string): string {
  return text.replace(/\u0000/g, '\uFFFD').replace(LONE_SURROGATE, '\uFFFD');
}

/**
 * A copy of a provider payload that PostgreSQL can store: JSON may carry NUL characters and lone
 * surrogates, which jsonb refuses — the event would then never be recorded, however often sent.
 */
function storableJson(value: unknown): unknown {
  if (typeof value === 'string') {
    return storableText(value);
  }
  if (Array.isArray(value)) {
    return value.map(storableJson);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [storableText(key), storableJson(item)]));
  }
  return value;
}

/** A string field of an unvalidated body, when it is usable as is. */
function textField(body: Record<string, unknown> | undefined, key: string, maxLength: number): string | undefined {
  const value = body?.[key];
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined;
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stateMachine: StateMachineService,
    private readonly subscriptions: SubscriptionsService,
    private readonly checkout: CheckoutService,
    private readonly eventLog: EventLogService,
  ) {}

  /**
   * Verifies the provider signature over the raw body BEFORE parsing anything, then records the
   * event and applies its effect in one transaction keyed by (provider, providerEventId), so a
   * redelivered (or concurrently duplicated) event is applied exactly once. Every signed event is
   * stored with its outcome: money that cannot be applied safely — including a body we cannot read
   * and an unexpected failure while applying — is kept as NEEDS_REVIEW and acknowledged, never
   * dropped. Only a transient database failure is refused (503), so the provider retries it.
   */
  async handle(rawBody: Buffer | undefined, signature: string | undefined): Promise<PaymentEvent> {
    const secret = this.config.get<string>('payments.webhookSecret', '');
    if (!secret) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'Payment webhooks are not configured',
        code: 'WEBHOOK_NOT_CONFIGURED',
      });
    }
    const signed =
      !!rawBody &&
      verifyWebhookSignature({
        rawBody,
        header: signature,
        secret,
        toleranceSeconds: this.config.get<number>('payments.webhookToleranceSeconds', 300),
      });
    if (!signed) {
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid webhook signature',
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
    }

    const parsed = await this.parse(rawBody as Buffer);
    if (!parsed.ok) {
      return this.recordUnreadable(rawBody as Buffer, parsed);
    }
    const dto = parsed.dto;

    let event: PaymentEvent;
    try {
      event = await this.prisma.$transaction(
        async (tx) => {
          // Inserted first: a concurrent duplicate waits on the unique key and is then refused.
          const created = await tx.paymentEvent.create({
            data: { ...this.eventFields(dto), outcome: 'NEEDS_REVIEW', note: 'Being applied' },
          });
          const applied = await this.collapseRepeatedReview(tx, created.id, dto, await this.apply(tx, dto));
          return tx.paymentEvent.update({
            where: { id: created.id },
            data: {
              outcome: applied.outcome,
              note: applied.note?.slice(0, MAX_NOTE_LENGTH) ?? null,
              subscriptionId: applied.subscriptionId ?? null,
            },
          });
        },
        { maxWait: 5_000, timeout: 15_000 },
      );
    } catch (err) {
      if (isDuplicateEvent(err)) {
        this.logger.log(`Duplicate payment event ${dto.provider}/${dto.providerEventId} ignored`);
        return this.existing(dto.provider, dto.providerEventId);
      }
      if (isTransientDatabaseError(err)) {
        this.logger.warn(`Payment event ${dto.provider}/${dto.providerEventId} refused for a retry: ${(err as Error).message}`);
        throw new ServiceUnavailableException({
          success: false,
          message: 'The event could not be recorded right now; retry later',
          code: 'WEBHOOK_RETRY',
        });
      }
      // A failure that is not transient would fail every retry the same way: keep it for review.
      this.logger.error(
        `Applying payment event ${dto.provider}/${dto.providerEventId} failed; kept for review`,
        (err as Error).stack,
      );
      event = await this.recordUnapplied(dto, err);
    }

    if (event.outcome === 'NEEDS_REVIEW') {
      this.logger.error(
        `Payment event ${event.id} (${dto.provider}/${dto.providerEventId}, ${dto.type}) needs review: ${event.note} ` +
          `[subscription=${event.subscriptionId ?? '-'} checkout=${dto.checkoutId ?? '-'} invoice=${dto.invoiceId ?? '-'}]`,
      );
    }
    await this.eventLog.record('payment.webhook', 'PaymentEvent', event.id, {
      provider: dto.provider,
      type: dto.type,
      outcome: event.outcome,
      subscriptionId: event.subscriptionId,
    });
    return event;
  }

  private async parse(rawBody: Buffer): Promise<ParsedBody> {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { ok: false, reason: 'The body is not valid JSON' };
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { ok: false, reason: 'The body is not a JSON object' };
    }
    const dto = plainToInstance(PaymentWebhookDto, body);
    const errors = await validate(dto as object, { forbidUnknownValues: true });
    if (errors.length > 0) {
      const fields = errors.map((error) => error.property).join(', ');
      return { ok: false, reason: `The body failed validation (${fields})`, body: body as Record<string, unknown> };
    }
    // Stored and looked up exactly as PostgreSQL can hold them.
    dto.provider = storableText(dto.provider);
    dto.providerEventId = storableText(dto.providerEventId);
    dto.type = storableText(dto.type);
    if (dto.invoiceId !== undefined) {
      dto.invoiceId = storableText(dto.invoiceId);
    }
    return { ok: true, dto };
  }

  /**
   * A signed body that cannot be read: kept as is for review. Its provider event id (or, failing
   * that, a hash of the body) makes the provider's retries of it a single item.
   */
  private async recordUnreadable(rawBody: Buffer, parsed: { reason: string; body?: Record<string, unknown> }) {
    const provider = storableText(textField(parsed.body, 'provider', 50) ?? 'unreadable');
    const providerEventId = storableText(
      textField(parsed.body, 'providerEventId', 200) ?? `sha256:${createHash('sha256').update(rawBody).digest('hex')}`,
    );
    const payload = storableJson(parsed.body ?? { raw: rawBody.toString('utf8').slice(0, MAX_STORED_RAW_BODY) });
    try {
      const event = await this.prisma.paymentEvent.create({
        data: {
          provider,
          providerEventId,
          type: storableText(textField(parsed.body, 'type', 100) ?? 'unreadable'),
          payload: payload as Prisma.InputJsonValue,
          outcome: 'NEEDS_REVIEW',
          note: parsed.reason,
        },
      });
      this.logger.error(`Signed payment event ${event.id} (${provider}/${providerEventId}) could not be read: ${parsed.reason}`);
      return event;
    } catch (err) {
      if (isDuplicateEvent(err)) {
        return this.existing(provider, providerEventId);
      }
      throw err;
    }
  }

  /** The event, kept for review after applying it failed (the failed attempt left nothing behind). */
  private async recordUnapplied(dto: PaymentWebhookDto, failure: unknown): Promise<PaymentEvent> {
    const subscription = dto.subscriptionId
      ? await this.prisma.subscription.findUnique({ where: { id: dto.subscriptionId }, select: { id: true } })
      : null;
    try {
      return await this.prisma.paymentEvent.create({
        data: {
          ...this.eventFields(dto),
          outcome: 'NEEDS_REVIEW',
          note: `Could not be applied: ${(failure as Error)?.message ?? String(failure)}`.slice(0, MAX_NOTE_LENGTH),
          subscriptionId: subscription?.id ?? null,
        },
      });
    } catch (err) {
      if (isDuplicateEvent(err)) {
        return this.existing(dto.provider, dto.providerEventId);
      }
      throw err;
    }
  }

  private existing(provider: string, providerEventId: string): Promise<PaymentEvent> {
    return this.prisma.paymentEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
  }

  /** What the event says was paid and for what, stored whatever the outcome. */
  private eventFields(dto: PaymentWebhookDto) {
    return {
      provider: dto.provider,
      providerEventId: dto.providerEventId,
      type: dto.type,
      payload: storableJson(dto.payload) as Prisma.InputJsonValue,
      checkoutId: dto.checkoutId ?? null,
      invoiceId: dto.invoiceId ?? null,
      amount: dto.amount === undefined ? null : new Prisma.Decimal(dto.amount),
      currency: dto.currency?.toUpperCase() ?? null,
    };
  }

  /**
   * One review item per unapplied payment: the same payment announced again (another event of the
   * same type, for the same invoice or checkout and amount) is recorded as IGNORED, pointing at the
   * first. Repeats for a known subscription or checkout are serialized by the locks apply() takes;
   * simultaneous repeats about an unknown one may still each become an item.
   */
  private async collapseRepeatedReview(
    tx: Tx,
    eventId: string,
    dto: PaymentWebhookDto,
    applied: AppliedEvent,
  ): Promise<AppliedEvent> {
    if (applied.outcome !== 'NEEDS_REVIEW' || dto.amount === undefined || !dto.currency) {
      return applied;
    }
    const samePayment: Prisma.PaymentEventWhereInput | null = dto.invoiceId
      ? { invoiceId: dto.invoiceId, subscriptionId: applied.subscriptionId ?? null }
      : dto.checkoutId
        ? { checkoutId: dto.checkoutId }
        : null;
    if (!samePayment) {
      return applied;
    }
    const earlier = await tx.paymentEvent.findFirst({
      where: {
        ...samePayment,
        id: { not: eventId },
        type: dto.type,
        outcome: 'NEEDS_REVIEW',
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency.toUpperCase(),
      },
      select: { id: true },
    });
    return earlier
      ? { outcome: 'IGNORED', note: `Same payment as review item ${earlier.id}`, subscriptionId: applied.subscriptionId }
      : applied;
  }

  private async apply(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    switch (dto.type) {
      case 'checkout.completed':
        return this.checkout.completeFromWebhook(tx, dto);
      case 'invoice.paid':
        return this.applyPaidInvoice(tx, dto);
      case 'invoice.payment_failed':
        return this.applyFailedPayment(tx, dto);
      case 'subscription.cancelled':
        return this.applyCancellation(tx, dto);
      default: {
        const known = dto.subscriptionId
          ? await tx.subscription.findUnique({ where: { id: dto.subscriptionId }, select: { id: true } })
          : null;
        if (dto.amount !== undefined && dto.amount > 0) {
          return {
            outcome: 'NEEDS_REVIEW',
            note: `Event type ${dto.type} reports a payment of ${describeMoney(dto.amount, dto.currency)} that nothing applies`,
            subscriptionId: known?.id ?? null,
          };
        }
        return { outcome: 'IGNORED', note: `No effect for event type ${dto.type}`, subscriptionId: known?.id ?? null };
      }
    }
  }

  /**
   * The subscription with its owner's lock (the lock every subscription writer takes, so this
   * cannot interleave with subscribe / checkout / cancel) and its own row lock (so the lifecycle
   * sweep waits for this decision instead of overwriting it).
   */
  private async lockedSubscription(tx: Tx, subscriptionId: string | undefined): Promise<LockedSubscription | null> {
    if (!subscriptionId) {
      return null;
    }
    const owner = await tx.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true } });
    if (!owner) {
      return null;
    }
    await lockUser(tx, owner.userId);
    await lockSubscription(tx, subscriptionId);
    return tx.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, user: { select: { deletedAt: true } } },
    });
  }

  /**
   * A paid renewal invoice: applied once per invoice id, only for the price agreed for this
   * subscription, extending the paid period from where it ends (or from now, reactivating a
   * subscription that lapsed while the payment was on its way, if the user has not started another
   * one meanwhile). A cancellation the user asked for stays in force: the paid period is granted
   * and nothing renews after it.
   */
  private async applyPaidInvoice(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    const sub = await this.lockedSubscription(tx, dto.subscriptionId);
    if (!sub) {
      return { outcome: 'NEEDS_REVIEW', note: 'Paid invoice for an unknown subscription' };
    }
    const subscriptionId = sub.id;
    if (sub.user.deletedAt) {
      return { outcome: 'NEEDS_REVIEW', note: 'Payment for a subscription of a deleted account', subscriptionId };
    }
    if (!dto.invoiceId) {
      return { outcome: 'NEEDS_REVIEW', note: 'Paid invoice without an invoice id', subscriptionId };
    }
    if (!isExactPayment(dto.amount, dto.currency, sub.price, sub.currency)) {
      return {
        outcome: 'NEEDS_REVIEW',
        note: `Paid ${describeMoney(dto.amount, dto.currency)} but the subscription was agreed at ${describeMoney(sub.price, sub.currency)}`,
        subscriptionId,
      };
    }
    const seen = await tx.subscriptionInvoice.findUnique({
      where: { subscriptionId_providerInvoiceId: { subscriptionId, providerInvoiceId: dto.invoiceId } },
    });
    if (seen) {
      return { outcome: 'IGNORED', note: 'Invoice already applied', subscriptionId };
    }

    const now = new Date();
    let start: Date;
    if (sub.status === SubscriptionStatus.CANCELLED) {
      return { outcome: 'NEEDS_REVIEW', note: 'Payment for a cancelled subscription', subscriptionId };
    }
    if (sub.status === SubscriptionStatus.EXPIRED) {
      const other = await tx.subscription.findFirst({
        where: { userId: sub.userId, status: { in: LIVE_STATUSES }, id: { not: sub.id } },
        select: { id: true },
      });
      if (other) {
        return { outcome: 'NEEDS_REVIEW', note: 'Payment for a lapsed subscription the user has replaced', subscriptionId };
      }
      start = now;
    } else {
      start = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    }
    const end = new Date(start.getTime() + billingCyclePeriodMs(sub.billingCycle));

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end },
    });
    await tx.subscriptionInvoice.create({
      data: {
        subscriptionId,
        providerInvoiceId: dto.invoiceId,
        amount: new Prisma.Decimal(dto.amount as number),
        currency: (dto.currency as string).toUpperCase(),
        periodStart: start,
        periodEnd: end,
      },
    });
    await this.subscriptions.allocateLeads(tx, sub, sub.plan, start, end);
    return { outcome: 'APPLIED', subscriptionId };
  }

  /** A failed charge matters only once the paid (or trial) period is over; a late notice is ignored. */
  private async applyFailedPayment(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    const sub = await this.lockedSubscription(tx, dto.subscriptionId);
    if (!sub) {
      return { outcome: 'IGNORED', note: 'Failed payment for an unknown subscription' };
    }
    const graph = this.stateMachine.subscriptionGraph;
    if (sub.currentPeriodEnd > new Date()) {
      return { outcome: 'IGNORED', note: 'The paid period is still running', subscriptionId: sub.id };
    }
    if (!this.stateMachine.canTransition(graph, sub.status, SubscriptionStatus.PAST_DUE)) {
      return { outcome: 'IGNORED', note: `Subscription is ${sub.status}`, subscriptionId: sub.id };
    }
    await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.PAST_DUE } });
    return { outcome: 'APPLIED', subscriptionId: sub.id };
  }

  private async applyCancellation(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    const sub = await this.lockedSubscription(tx, dto.subscriptionId);
    if (!sub) {
      return { outcome: 'IGNORED', note: 'Cancellation for an unknown subscription' };
    }
    if (!this.stateMachine.canTransition(this.stateMachine.subscriptionGraph, sub.status, SubscriptionStatus.CANCELLED)) {
      return { outcome: 'IGNORED', note: `Subscription is ${sub.status}`, subscriptionId: sub.id };
    }
    await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.CANCELLED } });
    return { outcome: 'APPLIED', subscriptionId: sub.id };
  }
}
