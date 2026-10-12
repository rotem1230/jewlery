import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutSession, CheckoutStatus, Prisma, SubscriptionStatus, User } from '@prisma/client';
import { EventLogService } from '../audit/event-log.service';
import { resolvePaymentProvider } from '../common/payments/payment-provider';
import { PrismaService } from '../database/prisma.service';
import { billingCyclePeriodMs } from './billing-periods';
import { PaymentWebhookDto, SubscribeDto } from './dto/subscription.dto';
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
 * subscription, replacing a free plan or a trial (one live subscription per user).
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
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${user.id}::uuid FOR UPDATE`;
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
   * ACTIVE subscription (once). A payment that cannot be applied safely is kept for review. A
   * session paid after it expired is still honoured: the money was taken for this plan.
   */
  async completeFromWebhook(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    if (!dto.checkoutId) {
      return { outcome: 'NEEDS_REVIEW', note: 'checkout.completed without a checkout id' };
    }
    const found = await tx.checkoutSession.findUnique({ where: { id: dto.checkoutId }, select: { userId: true } });
    if (!found) {
      return { outcome: 'NEEDS_REVIEW', note: 'Payment for an unknown checkout' };
    }
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${found.userId}::uuid FOR UPDATE`;
    const session = await tx.checkoutSession.findUniqueOrThrow({ where: { id: dto.checkoutId }, include: { plan: true } });
    if (session.status === CheckoutStatus.COMPLETED) {
      return { outcome: 'IGNORED', note: 'Checkout already completed', subscriptionId: session.subscriptionId };
    }
    const paidExactly =
      dto.amount !== undefined &&
      dto.currency !== undefined &&
      new Prisma.Decimal(dto.amount).equals(session.amount) &&
      dto.currency.toUpperCase() === session.currency.toUpperCase();
    if (!paidExactly) {
      return {
        outcome: 'NEEDS_REVIEW',
        note: `Paid ${dto.amount ?? '?'} ${dto.currency ?? '?'} for a checkout of ${session.amount.toString()} ${session.currency}`,
      };
    }
    if (await this.hasPaidLiveSubscription(tx, session.userId)) {
      return { outcome: 'NEEDS_REVIEW', note: 'The buyer already pays for a plan (double payment)' };
    }

    // A free plan or a trial is replaced by the plan that was paid for.
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
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
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

  /** A live subscription to a priced plan that is not just a trial. */
  private async hasPaidLiveSubscription(tx: Tx, userId: string): Promise<boolean> {
    const paid = await tx.subscription.count({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        plan: { is: { price: { gt: 0 } } },
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
