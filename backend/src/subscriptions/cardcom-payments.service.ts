import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutSession, CheckoutStatus, PaymentMethodUpdate, Prisma, SubscriptionStatus, User } from '@prisma/client';
import { lockSubscription, lockUser } from '../database/row-locks';
import { CardcomCharge, CardcomClient, CardcomUnavailableError } from '../common/payments/cardcom.client';
import { resolvePaymentProvider } from '../common/payments/payment-provider';
import { PrismaService } from '../database/prisma.service';
import { PAST_DUE_GRACE_MS } from './billing-periods';
import { cardcomUrls } from './cardcom-urls';
import { PaymentWebhookDto } from './dto/subscription.dto';
import { paymentProviderUnavailable } from './payment-provider-errors';
import { PaymentWebhookService } from './payment-webhook.service';

const HOUR_MS = 60 * 60 * 1000;
/** Renewals are charged in the last hours of a period, so the next one starts where it ends. */
export const RENEW_AHEAD_MS = 12 * HOUR_MS;
/** After a declined renewal, the card is tried again a day later (until the grace period ends). */
export const RENEWAL_RETRY_MS = 24 * HOUR_MS;
/** Renewals one sweep charges at most (the rest wait for the next sweep). */
const RENEWALS_PER_SWEEP = 50;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROVIDER = 'cardcom';

const RENEWABLE = {
  plan: true,
  pendingPlan: true,
  paymentMethod: true,
  user: { select: { email: true, firstName: true, lastName: true } },
} satisfies Prisma.SubscriptionInclude;
type RenewableSubscription = Prisma.SubscriptionGetPayload<{ include: typeof RENEWABLE }>;

/** The payment page id of a Cardcom notification body (LowProfileResult), whatever the key's case. */
function pageIdOf(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entry = Object.entries(body as Record<string, unknown>).find(([key]) => key.toLowerCase() === 'lowprofileid');
  const value = entry?.[1];
  return typeof value === 'string' && GUID.test(value.trim()) ? value.trim().toLowerCase() : null;
}

function webhookDto(fields: Omit<PaymentWebhookDto, 'provider'>): PaymentWebhookDto {
  return Object.assign(new PaymentWebhookDto(), { provider: PROVIDER, ...fields });
}

/**
 * Plan payments by card through Cardcom. A paid payment page activates the plan only once Cardcom
 * itself confirms the deal (LowProfile/GetLpResult): its notification is not signed, so only the
 * page id is taken from it. The card it saved (a token) pays the renewals, charged once per period
 * attempt (Cardcom refuses a repeated unique id). Every outcome goes through the payment events
 * (PaymentWebhookService.record): applied once, money that cannot be applied kept for review.
 */
@Injectable()
export class CardcomPaymentsService {
  private readonly logger = new Logger(CardcomPaymentsService.name);
  /**
   * Other kinds of Cardcom pages (jewelry payments) register here: a notification goes to the
   * first that knows its page, a return page to the handler of its kind.
   */
  private readonly pageHandlers: Array<(lowProfileId: string) => Promise<boolean>> = [];
  private readonly returnHandlers = new Map<string, (id: string) => Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cardcom: CardcomClient,
    private readonly payments: PaymentWebhookService,
  ) {}

  registerPageHandler(handler: (lowProfileId: string) => Promise<boolean>): void {
    this.pageHandlers.push(handler);
  }

  registerReturnHandler(kind: string, handler: (id: string) => Promise<void>): void {
    this.returnHandlers.set(kind, handler);
  }

  /** The buyer came back from a page of another kind (e.g. jewelry): confirmed by its handler. */
  async confirmReturn(kind: string, id: string): Promise<void> {
    const handler = this.returnHandlers.get(kind);
    if (!handler) return;
    try {
      await handler(id);
    } catch (err) {
      this.logger.warn(`Return of ${kind} page ${id} could not be confirmed now: ${(err as Error).message}`);
    }
  }

  enabled(): boolean {
    try {
      return resolvePaymentProvider(this.config, ['mock', 'cardcom']) === 'cardcom';
    } catch {
      return false;
    }
  }

  /** Cardcom's notification of a payment page deal. */
  async handleNotification(body: unknown): Promise<{ received: true }> {
    const lowProfileId = pageIdOf(body);
    if (!lowProfileId) {
      throw new BadRequestException({
        success: false,
        message: 'A Cardcom notification must carry the LowProfileId of the payment page',
        code: 'CARDCOM_NOTIFICATION_INVALID',
      });
    }
    const session = await this.prisma.checkoutSession.findUnique({ where: { providerRef: lowProfileId } });
    if (session && session.provider === PROVIDER) {
      await this.confirm(session);
      return { received: true };
    }
    const update = await this.prisma.paymentMethodUpdate.findUnique({ where: { providerRef: lowProfileId } });
    if (update) {
      await this.confirmCardUpdate(update);
      return { received: true };
    }
    for (const handler of this.pageHandlers) {
      if (await handler(lowProfileId)) return { received: true };
    }
    this.logger.warn(`Cardcom notification for a payment page this platform did not open (${lowProfileId}): ignored`);
    return { received: true };
  }

  /** The card the user's paid plan renews with, as the owner may see it (never the token). */
  async paymentMethod(user: User) {
    const sub = await this.cardPlan(user.id);
    if (!sub?.paymentMethod) return null;
    const expiry = sub.paymentMethod.cardExpiry;
    return {
      provider: sub.paymentMethod.provider,
      cardExpiry: `${expiry.slice(0, 2)}/${expiry.slice(2)}`,
      cardLast4: sub.paymentMethod.cardLast4,
    };
  }

  /** A Cardcom page that only saves a new card (CreateTokenOnly) for the user's paid plan. */
  async startCardUpdate(user: User) {
    const sub = await this.cardPlan(user.id);
    if (!sub) {
      throw new BadRequestException({ success: false, message: 'There is no plan paid by card to update', code: 'NO_CARD_PLAN' });
    }
    const update = await this.prisma.paymentMethodUpdate.create({
      data: { userId: user.id, subscriptionId: sub.id, provider: PROVIDER, status: 'OPEN' },
    });
    let page;
    try {
      page = await this.cardcom.createPaymentPage({
        operation: 'CreateTokenOnly',
        amount: Number(sub.price),
        currency: sub.currency,
        returnValue: update.id,
        ...cardcomUrls(this.config, 'card', update.id),
        productName: 'עדכון כרטיס לחיוב המנוי',
        customer: { name: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.email },
      });
    } catch (err) {
      await this.prisma.paymentMethodUpdate.update({ where: { id: update.id }, data: { status: 'CANCELLED' } });
      this.logger.warn(`Cardcom could not open a card update page (${update.id}): ${(err as Error).message}`);
      throw paymentProviderUnavailable();
    }
    const opened = await this.prisma.paymentMethodUpdate.update({
      where: { id: update.id },
      data: { providerRef: page.lowProfileId.toLowerCase(), paymentUrl: page.url },
    });
    return { id: opened.id, status: opened.status, paymentUrl: opened.paymentUrl };
  }

  /** The owner's card update; an open one is confirmed with Cardcom first. */
  async findCardUpdate(user: User, updateId: string) {
    let update = await this.prisma.paymentMethodUpdate.findFirst({ where: { id: updateId, userId: user.id } });
    if (!update) throw new NotFoundException({ success: false, message: 'Card update not found' });
    if (update.status === 'OPEN') {
      await this.confirmCardUpdateQuietly(update.id);
      update = await this.prisma.paymentMethodUpdate.findUniqueOrThrow({ where: { id: updateId } });
    }
    return { id: update.id, status: update.status, paymentUrl: update.paymentUrl };
  }

  /** The return page of a card update: confirmed with Cardcom (an outage leaves it open). */
  async confirmCardUpdateQuietly(updateId: string): Promise<void> {
    const update = await this.prisma.paymentMethodUpdate.findUnique({ where: { id: updateId } });
    if (!update || update.status !== 'OPEN') return;
    try {
      await this.confirmCardUpdate(update);
    } catch (err) {
      this.logger.warn(`Card update ${updateId} could not be confirmed with Cardcom now: ${(err as Error).message}`);
    }
  }

  /**
   * A card update page Cardcom confirms saved a card: the plan renews with the new card (the old
   * token is deleted when nothing else uses it), and a plan past due is charged with it at once.
   */
  private async confirmCardUpdate(update: PaymentMethodUpdate): Promise<void> {
    if (update.status !== 'OPEN' || !update.providerRef) return;
    let result;
    try {
      result = await this.cardcom.getPaymentPageResult(update.providerRef);
    } catch (err) {
      if (err instanceof CardcomUnavailableError) throw paymentProviderUnavailable();
      throw err;
    }
    const token = result.token;
    if (!result.tokenSaved || !token) return;
    if (result.returnValue !== update.id) {
      this.logger.error(`Cardcom reported card page ${update.providerRef} for ${result.returnValue ?? 'nothing'}, not update ${update.id}: ignored`);
      return;
    }
    const applied = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, update.userId);
      const claimed = await tx.paymentMethodUpdate.updateMany({
        where: { id: update.id, status: 'OPEN' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await lockSubscription(tx, update.subscriptionId);
      const sub = await tx.subscription.findUniqueOrThrow({ where: { id: update.subscriptionId } });
      const method = await tx.paymentMethod.create({
        data: {
          userId: update.userId,
          provider: PROVIDER,
          token: token.token,
          cardExpiry: token.cardExpiryMMYY,
          cardLast4: result.cardLast4,
          tokenExpiresAt: token.expiresAt,
        },
      });
      await tx.subscription.update({ where: { id: sub.id }, data: { paymentMethodId: method.id } });
      if (sub.paymentMethodId) {
        const stillUsed = await tx.subscription.count({ where: { paymentMethodId: sub.paymentMethodId } });
        if (stillUsed === 0) await tx.paymentMethod.delete({ where: { id: sub.paymentMethodId } });
      }
      return true;
    });
    if (applied) {
      await this.renewNow(update.subscriptionId);
    }
  }

  /** A paid plan whose period is over (past due) is charged now, without waiting for the next try. */
  private async renewNow(subscriptionId: string): Promise<void> {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        cancelAtPeriodEnd: false,
        price: { gt: 0 },
        currentPeriodEnd: { lte: now },
        user: { deletedAt: null },
      },
      include: RENEWABLE,
    });
    if (!sub) return;
    try {
      await this.renew(sub, now, { retryNow: true });
    } catch (err) {
      this.logger.error(`Charging subscription ${subscriptionId} with its new card failed: ${(err as Error).message}`);
    }
  }

  /** The user's live paid plan renewed by a card (Cardcom token). */
  private cardPlan(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        price: { gt: 0 },
        paymentMethod: { is: { provider: PROVIDER } },
      },
      include: { paymentMethod: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Confirms an open Cardcom checkout with Cardcom (the buyer came back, or follows it): the plan
   * starts even if the notification is late. A Cardcom outage leaves it open for the next look.
   */
  async confirmCheckout(checkoutId: string): Promise<void> {
    const session = await this.prisma.checkoutSession.findUnique({ where: { id: checkoutId } });
    if (!session || session.provider !== PROVIDER || session.status !== CheckoutStatus.OPEN) return;
    try {
      await this.confirm(session);
    } catch (err) {
      this.logger.warn(`Checkout ${checkoutId} could not be confirmed with Cardcom now: ${(err as Error).message}`);
    }
  }

  private async confirm(session: CheckoutSession): Promise<void> {
    if (session.status !== CheckoutStatus.OPEN || !session.providerRef) return;
    let result;
    try {
      result = await this.cardcom.getPaymentPageResult(session.providerRef);
    } catch (err) {
      if (err instanceof CardcomUnavailableError) throw paymentProviderUnavailable();
      throw err;
    }
    if (!result.paid) return;

    const terminal = this.config.get<number>('cardcom.terminalNumber');
    const mismatch =
      result.returnValue !== session.id
        ? `Cardcom confirmed payment page ${session.providerRef} for ${result.returnValue ?? 'no'} checkout, not ${session.id}`
        : result.terminalNumber !== null && result.terminalNumber !== terminal
          ? `Payment page ${session.providerRef} was paid on terminal ${result.terminalNumber}, not ${terminal}`
          : null;
    const dto = webhookDto({
      providerEventId: `lp:${session.providerRef}`,
      type: mismatch ? 'payment.review' : 'checkout.completed',
      checkoutId: session.id,
      invoiceId: result.transactionId ?? undefined,
      amount: result.amount ?? undefined,
      currency: result.currency ?? undefined,
      payload: {
        lowProfileId: session.providerRef,
        transactionId: result.transactionId,
        terminalNumber: result.terminalNumber,
        returnValue: result.returnValue,
        description: result.description,
        ...(mismatch ? { reviewReason: mismatch } : {}),
      },
    });
    const token = result.token;
    await this.payments.record(dto, {
      after: async (tx, applied) => {
      if (applied.outcome !== 'APPLIED' || !applied.subscriptionId || !token) return;
      // The card the plan was bought with pays its renewals.
      const method = await tx.paymentMethod.create({
        data: {
          userId: session.userId,
          provider: PROVIDER,
          token: token.token,
          cardExpiry: token.cardExpiryMMYY,
          cardLast4: result.cardLast4,
          tokenExpiresAt: token.expiresAt,
        },
      });
      await tx.subscription.update({ where: { id: applied.subscriptionId }, data: { paymentMethodId: method.id } });
      },
    });
  }

  /**
   * Charges the saved card of the paid plans whose period ends within RENEW_AHEAD_MS (or ended,
   * within the grace period), unless their owner cancelled them. Called by the lifecycle sweep.
   */
  async renewDue(now: Date): Promise<number> {
    if (!this.enabled()) return 0;
    const due = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        cancelAtPeriodEnd: false,
        price: { gt: 0 },
        paymentMethod: { is: { provider: PROVIDER } },
        currentPeriodEnd: { lte: new Date(now.getTime() + RENEW_AHEAD_MS), gt: new Date(now.getTime() - PAST_DUE_GRACE_MS) },
        user: { deletedAt: null },
      },
      include: RENEWABLE,
      orderBy: { currentPeriodEnd: 'asc' },
      take: RENEWALS_PER_SWEEP,
    });
    let charged = 0;
    for (const sub of due) {
      try {
        if (await this.renew(sub, now)) charged += 1;
      } catch (err) {
        this.logger.error(`Renewal of subscription ${sub.id} could not be completed now: ${(err as Error).message}`);
      }
    }
    return charged;
  }

  private async renew(sub: RenewableSubscription, now: Date, options: { retryNow?: boolean } = {}): Promise<boolean> {
    if (!sub.paymentMethod) return false;
    const period = `renewal:${sub.id}:${Math.floor(sub.currentPeriodEnd.getTime() / 1000)}`;
    const declines = await this.prisma.paymentEvent.findMany({
      where: { provider: PROVIDER, subscriptionId: sub.id, type: 'invoice.payment_failed', providerEventId: { startsWith: `${period}:` } },
      orderBy: { processedAt: 'desc' },
      select: { processedAt: true },
    });
    if (!options.retryNow && declines[0] && now.getTime() - declines[0].processedAt.getTime() < RENEWAL_RETRY_MS) {
      return false;
    }
    const uniqueId = `${period}:${declines.length}`;
    // A plan chosen for this renewal is what is charged, and what the plan becomes once paid.
    const next = sub.pendingPlan && sub.pendingPlan.isActive ? sub.pendingPlan : null;

    // An earlier attempt whose answer was lost may have charged the card: look it up first.
    let charge: CardcomCharge | null = await this.cardcom.findTransaction(uniqueId);
    if (!charge) {
      charge = await this.cardcom.chargeToken({
        token: sub.paymentMethod.token,
        cardExpiryMMYY: sub.paymentMethod.cardExpiry,
        amount: Number(next ? next.price : sub.price),
        currency: next ? next.currency : sub.currency,
        externalUniqTranId: uniqueId,
        productName: (next ?? sub.plan).nameHe,
        customer: { name: [sub.user.firstName, sub.user.lastName].filter(Boolean).join(' '), email: sub.user.email },
      });
      if (charge.status === 'DUPLICATE') {
        charge = await this.cardcom.findTransaction(uniqueId);
      }
    }

    if (charge?.status === 'APPROVED' && charge.transactionId) {
      await this.payments.record(
        webhookDto({
          providerEventId: `tx:${charge.transactionId}`,
          type: 'invoice.paid',
          subscriptionId: sub.id,
          invoiceId: charge.transactionId,
          amount: charge.amount ?? undefined,
          currency: charge.currency ?? undefined,
          payload: {
            externalUniqTranId: uniqueId,
            transactionId: charge.transactionId,
            description: charge.description,
            ...(next ? { planChange: next.code } : {}),
          },
        }),
        {
          // Paid for the plan chosen: the subscription becomes that plan before the payment applies.
          before: next
            ? async (tx) => {
                await lockUser(tx, sub.userId);
                await lockSubscription(tx, sub.id);
                await tx.subscription.updateMany({
                  where: { id: sub.id, pendingPlanId: next.id },
                  data: {
                    planId: next.id,
                    price: next.price,
                    currency: next.currency,
                    billingCycle: next.billingCycle,
                    pendingPlanId: null,
                  },
                });
              }
            : undefined,
        },
      );
      return true;
    }
    if (charge?.status === 'DECLINED') {
      await this.payments.record(
        webhookDto({
          providerEventId: uniqueId,
          type: 'invoice.payment_failed',
          subscriptionId: sub.id,
          payload: { externalUniqTranId: uniqueId, description: charge.description },
        }),
      );
      this.logger.warn(`Renewal of subscription ${sub.id} was declined (${charge.description}); tried again in a day`);
      return false;
    }
    // A repeat Cardcom refused, with no charge on record under that id: left for the next sweep.
    this.logger.warn(`Renewal ${uniqueId} reported as a duplicate but no charge was found`);
    return false;
  }
}
