import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutSession, CheckoutStatus, Prisma, SubscriptionStatus, User } from '@prisma/client';
import { EventLogService } from '../audit/event-log.service';
import { resolvePaymentProvider } from '../common/payments/payment-provider';
import { PrismaService } from '../database/prisma.service';
import { lockUser } from '../database/row-locks';
import { billingCyclePeriodMs } from './billing-periods';
import { PaymentWebhookDto, SubscribeDto } from './dto/subscription.dto';
import { describeMoney, isExactPayment } from './money';
import type { AppliedEvent } from './payment-webhook.service';
import { SubscriptionsService } from './subscriptions.service';

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
};

/**
 * Paid-plan purchases. The server fixes plan, amount and currency in a checkout session; only the
 * provider's signed checkout.completed webhook for exactly that amount turns it into an ACTIVE
 * subscription. It replaces whatever the user had live — a free plan or a trial, of either role:
 * a user has one live subscription at a time.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly eventLog: EventLogService,
  ) {}

  async start(user: User, dto: SubscribeDto): Promise<CheckoutView> {
    const provider = resolvePaymentProvider(this.config);
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
      const open = await tx.checkoutSession.findFirst({
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
          },
        })
      );
    });

    return this.view(session, plan.code, provider);
  }

  /**
   * checkout.completed: under the buyer's row lock, a session paid with its exact amount becomes an
   * ACTIVE subscription (once). A payment that cannot be applied safely is kept for review, and its
   * session is marked so (a new purchase gets a fresh session). A session paid after it expired is
   * still honoured: the money was taken for this plan. When the event names the provider invoice of
   * that first charge, it is recorded, so the same invoice's invoice.paid does not add a period.
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
    const session = await tx.checkoutSession.findUniqueOrThrow({
      where: { id: dto.checkoutId },
      include: { plan: true, user: { select: { deletedAt: true } } },
    });
    const paid = describeMoney(dto.amount, dto.currency);
    const price = describeMoney(session.amount, session.currency);
    const paidExactly = isExactPayment(dto.amount, dto.currency, session.amount, session.currency);

    if (session.status === CheckoutStatus.COMPLETED) {
      return paidExactly
        ? { outcome: 'IGNORED', note: 'Checkout already completed', subscriptionId: session.subscriptionId }
        : {
            outcome: 'NEEDS_REVIEW',
            note: `Paid ${paid} for checkout ${session.id}, already completed at ${price}`,
            subscriptionId: session.subscriptionId,
          };
    }
    if (session.status === CheckoutStatus.CANCELLED || session.user.deletedAt) {
      return { outcome: 'NEEDS_REVIEW', note: `Paid ${paid} for checkout ${session.id} after the buyer deleted their account` };
    }
    const unapplied = async (note: string): Promise<AppliedEvent> => {
      await tx.checkoutSession.update({ where: { id: session.id }, data: { status: CheckoutStatus.NEEDS_REVIEW } });
      return { outcome: 'NEEDS_REVIEW', note };
    };
    if (!paidExactly) {
      return unapplied(`Paid ${paid} for checkout ${session.id} of ${price}`);
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
    if (dto.invoiceId) {
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId: subscription.id,
          providerInvoiceId: dto.invoiceId,
          amount: session.amount,
          currency: session.currency,
          periodStart: now,
          periodEnd: end,
        },
      });
    }
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
    };
  }
}
