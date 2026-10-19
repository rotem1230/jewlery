import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutSession, CheckoutStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { CardcomCharge, CardcomClient, CardcomUnavailableError } from '../common/payments/cardcom.client';
import { resolvePaymentProvider } from '../common/payments/payment-provider';
import { PrismaService } from '../database/prisma.service';
import { PAST_DUE_GRACE_MS } from './billing-periods';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cardcom: CardcomClient,
    private readonly payments: PaymentWebhookService,
  ) {}

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
    if (!session || session.provider !== PROVIDER) {
      this.logger.warn(`Cardcom notification for a payment page this platform did not open (${lowProfileId}): ignored`);
      return { received: true };
    }
    await this.confirm(session);
    return { received: true };
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
    await this.payments.record(dto, async (tx, applied) => {
      if (applied.outcome !== 'APPLIED' || !applied.subscriptionId || !token) return;
      // The card the plan was bought with pays its renewals.
      const method = await tx.paymentMethod.create({
        data: {
          userId: session.userId,
          provider: PROVIDER,
          token: token.token,
          cardExpiry: token.cardExpiryMMYY,
          tokenExpiresAt: token.expiresAt,
        },
      });
      await tx.subscription.update({ where: { id: applied.subscriptionId }, data: { paymentMethodId: method.id } });
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

  private async renew(sub: RenewableSubscription, now: Date): Promise<boolean> {
    if (!sub.paymentMethod) return false;
    const period = `renewal:${sub.id}:${Math.floor(sub.currentPeriodEnd.getTime() / 1000)}`;
    const declines = await this.prisma.paymentEvent.findMany({
      where: { provider: PROVIDER, subscriptionId: sub.id, type: 'invoice.payment_failed', providerEventId: { startsWith: `${period}:` } },
      orderBy: { processedAt: 'desc' },
      select: { processedAt: true },
    });
    if (declines[0] && now.getTime() - declines[0].processedAt.getTime() < RENEWAL_RETRY_MS) {
      return false;
    }
    const uniqueId = `${period}:${declines.length}`;

    // An earlier attempt whose answer was lost may have charged the card: look it up first.
    let charge: CardcomCharge | null = await this.cardcom.findTransaction(uniqueId);
    if (!charge) {
      charge = await this.cardcom.chargeToken({
        token: sub.paymentMethod.token,
        cardExpiryMMYY: sub.paymentMethod.cardExpiry,
        amount: Number(sub.price),
        currency: sub.currency,
        externalUniqTranId: uniqueId,
        productName: sub.plan.nameHe,
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
          payload: { externalUniqTranId: uniqueId, transactionId: charge.transactionId, description: charge.description },
        }),
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
