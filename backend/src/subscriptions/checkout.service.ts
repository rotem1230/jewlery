import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutSession, CheckoutStatus, PlanCatalog, Prisma, SubscriptionStatus, User } from '@prisma/client';
import { EventLogService } from '../audit/event-log.service';
import { CardcomClient, CardcomUnavailableError } from '../common/payments/cardcom.client';
import { resolvePaymentProvider } from '../common/payments/payment-provider';
import { PrismaService } from '../database/prisma.service';
import { lockPaymentInvoice, lockUser } from '../database/row-locks';
import { billingCyclePeriodMs } from './billing-periods';
import { PaymentWebhookDto, SubscribeDto } from './dto/subscription.dto';
import { describeMoney, isExactPayment } from './money';
import type { AppliedEvent } from './payment-webhook.service';
import { SubscriptionsService } from './subscriptions.service';
import { cardcomUrls } from './cardcom-urls';
import { paymentProviderUnavailable } from './payment-provider-errors';

type Tx = Prisma.TransactionClient;

const CHECKOUT_TTL_MS = 60 * 60 * 1000;
const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

export type CheckoutView = {
  id: string;
  planCode: string;
  amount: number;
  currency: string;
  status: CheckoutStatus;
  expiresAt: Date;
  provider: string;
  /** The provider's payment page the app opens (Cardcom); null for the mock provider. */
  paymentUrl: string | null;
};

/**
 * Paid-plan purchases. The server fixes plan, amount and currency in a checkout session; only the
 * provider's signed checkout.completed webhook for exactly that amount turns it into an ACTIVE
 * subscription. It replaces whatever the user had live — a free plan or a trial, of either role:
 * a user has one live subscription at a time.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly eventLog: EventLogService,
    private readonly cardcom: CardcomClient,
  ) {}

  async start(user: User, dto: SubscribeDto): Promise<CheckoutView> {
    const provider = resolvePaymentProvider(this.config, ['mock', 'cardcom']);
    const plan = await this.prisma.planCatalog.findUnique({ where: { code: dto.planCode } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException({ success: false, message: 'Plan not found' });
    }
    if (!user.roles.includes(plan.role)) {
      throw new BadRequestException({ success: false, message: `This plan is only available for the ${plan.role} role` });
    }
    if (plan.price.isZero()) {
      throw new BadRequestException({ success: false, message: 'Free plans do not need a checkout', code: 'FREE_PLAN' });
    }

    const session = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      if (await this.hasPaidLiveSubscription(tx, user.id)) {
        throw new ConflictException({
          success: false,
          message: 'You already pay for a plan; cancel it before buying another',
          code: 'SUBSCRIPTION_EXISTS',
        });
      }
      // A Cardcom payment page belongs to one checkout: each attempt opens its own.
      const open =
        provider === 'cardcom'
          ? null
          : await tx.checkoutSession.findFirst({
              where: { userId: user.id, planId: plan.id, status: CheckoutStatus.OPEN, expiresAt: { gt: new Date() } },
              orderBy: { createdAt: 'desc' },
            });
      return (
        open ??
        tx.checkoutSession.create({
          data: {
            userId: user.id,
            planId: plan.id,
            amount: plan.price,
            currency: plan.currency,
            expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
            provider,
          },
        })
      );
    });

    if (provider === 'cardcom') {
      return this.view(await this.openCardcomPage(session, plan, user), plan.code, provider);
    }
    return this.view(session, plan.code, provider);
  }

  /**
   * The checkout of its buyer (another user's is "not found"). An open Cardcom checkout is first
   * confirmed by the caller (CardcomPaymentsService.confirmCheckout).
   */
  async find(user: User, checkoutId: string): Promise<CheckoutView> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { id: checkoutId, userId: user.id },
      include: { plan: { select: { code: true } } },
    });
    if (!session) {
      throw new NotFoundException({ success: false, message: 'Checkout not found' });
    }
    return this.view(session, session.plan.code, session.provider ?? 'mock');
  }

  /**
   * Opens the Cardcom page for this checkout: its exact amount, the checkout id returned with the
   * result, the receipt to the buyer. When Cardcom cannot open it, the checkout is withdrawn.
   */
  private async openCardcomPage(session: CheckoutSession, plan: PlanCatalog, user: User): Promise<CheckoutSession> {
    let page;
    try {
      page = await this.cardcom.createPaymentPage({
        amount: Number(session.amount),
        currency: session.currency,
        returnValue: session.id,
        ...cardcomUrls(this.config, 'checkout', session.id),
        productName: plan.nameHe,
        customer: { name: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.email },
      });
    } catch (err) {
      await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { status: CheckoutStatus.CANCELLED } });
      if (err instanceof CardcomUnavailableError) {
        this.logger.warn(`Cardcom could not open a payment page for checkout ${session.id}: ${err.message}`);
      } else {
        this.logger.error(`Cardcom refused a payment page for checkout ${session.id}: ${(err as Error).message}`);
      }
      throw paymentProviderUnavailable();
    }
    return this.prisma.checkoutSession.update({
      where: { id: session.id },
      data: { providerRef: page.lowProfileId.toLowerCase(), paymentUrl: page.url },
    });
  }

  /**
   * checkout.completed: under the buyer's row lock, a session paid with its exact amount becomes an
   * ACTIVE subscription (once). A payment that cannot be applied safely is kept for review, and its
   * session is marked so (a new purchase gets a fresh session; nothing more is applied on that one).
   * A session paid after it expired is still honoured: the money was taken for this plan. The event
   * must name the provider invoice of that first charge: it is recorded, so the same invoice's
   * invoice.paid does not add a period.
   */
  async completeFromWebhook(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    if (!dto.checkoutId) {
      return { outcome: 'NEEDS_REVIEW', note: 'checkout.completed without a checkout id' };
    }
    const found = await tx.checkoutSession.findUnique({ where: { id: dto.checkoutId }, select: { userId: true } });
    if (!found) {
      return { outcome: 'NEEDS_REVIEW', note: `Payment for an unknown checkout ${dto.checkoutId}` };
    }
    await lockUser(tx, found.userId);
    if (dto.invoiceId) {
      // That invoice's own payment notice may be applied right now without a known subscription:
      // whichever comes second sees the other (see applyPaidInvoice).
      await lockPaymentInvoice(tx, dto.invoiceId);
    }
    const session = await tx.checkoutSession.findUniqueOrThrow({
      where: { id: dto.checkoutId },
      include: { plan: true, user: { select: { deletedAt: true } } },
    });
    const paid = describeMoney(dto.amount, dto.currency);
    const price = describeMoney(session.amount, session.currency);
    const paidExactly = isExactPayment(dto.amount, dto.currency, session.amount, session.currency);

    if (session.status === CheckoutStatus.COMPLETED) {
      if (!paidExactly) {
        return {
          outcome: 'NEEDS_REVIEW',
          note: `Paid ${paid} for checkout ${session.id}, already completed at ${price}`,
          subscriptionId: session.subscriptionId,
        };
      }
      // Only the first charge announced again is already accounted for. Another invoice (or none
      // named) on a completed checkout is a charge nothing applied: kept for review, never dropped.
      const firstCharge =
        dto.invoiceId && session.subscriptionId
          ? await tx.subscriptionInvoice.findUnique({
              where: {
                subscriptionId_providerInvoiceId: { subscriptionId: session.subscriptionId, providerInvoiceId: dto.invoiceId },
              },
            })
          : null;
      return firstCharge
        ? { outcome: 'IGNORED', note: 'Checkout already completed', subscriptionId: session.subscriptionId }
        : {
            outcome: 'NEEDS_REVIEW',
            note: `Paid ${paid} for checkout ${session.id}, already completed with its first invoice; this charge was not applied`,
            subscriptionId: session.subscriptionId,
          };
    }
    if (session.status === CheckoutStatus.CANCELLED || session.user.deletedAt) {
      return { outcome: 'NEEDS_REVIEW', note: `Paid ${paid} for checkout ${session.id} after the buyer deleted their account` };
    }
    // Money on a checkout under review is never applied behind that review: it may be the very
    // payment the review is about, announced again.
    if (session.status === CheckoutStatus.NEEDS_REVIEW) {
      return { outcome: 'NEEDS_REVIEW', note: `Paid ${paid} for checkout ${session.id}, which is held for review` };
    }
    const unapplied = async (note: string): Promise<AppliedEvent> => {
      await tx.checkoutSession.update({ where: { id: session.id }, data: { status: CheckoutStatus.NEEDS_REVIEW } });
      return { outcome: 'NEEDS_REVIEW', note };
    };
    if (!paidExactly) {
      return unapplied(`Paid ${paid} for checkout ${session.id} of ${price}`);
    }
    // The provider bills the plan by invoice: without the first invoice's id, its invoice.paid
    // could not be told apart from a renewal and would add a second period for one payment.
    if (!dto.invoiceId) {
      return unapplied(`Paid ${paid} for checkout ${session.id} without the provider invoice of the first charge`);
    }
    if (await this.hasPaidLiveSubscription(tx, session.userId)) {
      return unapplied(`Paid ${paid} for checkout ${session.id}, but the buyer already pays for a plan (double payment)`);
    }

    // Whatever was live (a free plan or a trial) is replaced by the plan that was paid for.
    await tx.subscription.updateMany({
      where: { userId: session.userId, status: { in: LIVE_STATUSES } },
      data: { status: SubscriptionStatus.CANCELLED },
    });
    const now = new Date();
    const end = new Date(now.getTime() + billingCyclePeriodMs(session.plan.billingCycle));
    const subscription = await tx.subscription.create({
      data: {
        userId: session.userId,
        planId: session.planId,
        role: session.plan.role,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: session.plan.billingCycle,
        price: session.amount,
        currency: session.currency,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
    await tx.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        provider: dto.provider,
        providerInvoiceId: dto.invoiceId,
        amount: session.amount,
        currency: session.currency,
        periodStart: now,
        periodEnd: end,
      },
    });
    // That invoice's own payment notice may have come first, when no subscription existed yet:
    // it is settled now, not left for someone to refund.
    await tx.paymentEvent.updateMany({
      where: {
        type: 'invoice.paid',
        outcome: 'NEEDS_REVIEW',
        invoiceId: dto.invoiceId,
        amount: session.amount,
        currency: session.currency,
      },
      data: { outcome: 'IGNORED', note: `Settled by checkout ${session.id} (its first invoice)` },
    });
    await this.subscriptions.allocateLeads(tx, subscription, session.plan, now, end);
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: { status: CheckoutStatus.COMPLETED, completedAt: now, subscriptionId: subscription.id },
    });
    await tx.eventLog.create({
      data: {
        eventKey: 'subscription.purchased',
        entityType: 'Subscription',
        entityId: subscription.id,
        payload: { checkoutId: session.id, planCode: session.plan.code, userId: session.userId },
      },
    });
    return { outcome: 'APPLIED', subscriptionId: subscription.id };
  }

  /** A live subscription the user pays for (agreed at a price), not a trial or a free plan. */
  private async hasPaidLiveSubscription(tx: Tx, userId: string): Promise<boolean> {
    const paid = await tx.subscription.count({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        price: { gt: 0 },
      },
    });
    return paid > 0;
  }

  private view(session: CheckoutSession, planCode: string, provider: string): CheckoutView {
    return {
      id: session.id,
      planCode,
      amount: Number(session.amount),
      currency: session.currency,
      status: session.status,
      expiresAt: session.expiresAt,
      provider,
      paymentUrl: session.paymentUrl,
    };
  }
}
