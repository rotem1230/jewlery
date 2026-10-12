import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingCycle, LeadStatus, Prisma, SubscriptionStatus, User, UserRole } from '@prisma/client';
import { EventLogService } from '../audit/event-log.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PaymentWebhookDto, SubscribeDto } from './dto/subscription.dto';

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly outbox: OutboxService,
    private readonly eventLog: EventLogService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private billingCyclePeriodMs(cycle: BillingCycle): number {
    switch (cycle) {
      case BillingCycle.ANNUAL:
        return 365 * DAY_MS;
      case BillingCycle.MONTHLY:
      case BillingCycle.PER_ITEM:
      case BillingCycle.PER_LEAD:
      default:
        return 30 * DAY_MS;
    }
  }

  async listPlans(role?: UserRole) {
    return this.prisma.planCatalog.findMany({
      where: { isActive: true, ...(role ? { role } : {}) },
      orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
      include: { entitlements: { include: { entitlement: true } } },
    });
  }

  async me(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
  }

  async entitlementsMe(userId: string) {
    const keys = await this.entitlements.listActiveKeys(userId);
    return { keys };
  }

  async subscribe(user: User, dto: SubscribeDto) {
    const plan = await this.prisma.planCatalog.findUnique({ where: { code: dto.planCode } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException({ success: false, message: 'Plan not found' });
    }
    if (!user.roles.includes(plan.role)) {
      throw new BadRequestException({
        success: false,
        message: `This plan is only available for the ${plan.role} role`,
      });
    }

    const existing = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ACTIVE_STATUSES } },
    });
    if (existing) {
      throw new ConflictException({
        success: false,
        message: 'An active subscription already exists; cancel it before subscribing to a new plan',
        code: 'SUBSCRIPTION_EXISTS',
      });
    }

    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + this.billingCyclePeriodMs(plan.billingCycle));
    const status = plan.trialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE;
    const trialEndsAt = plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * DAY_MS) : null;

    const subscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          role: plan.role,
          status,
          billingCycle: plan.billingCycle,
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd,
        },
      });

      if (plan.leadQuota > 0) {
        await tx.lead.createMany({
          data: Array.from({ length: plan.leadQuota }, () => ({
            subscriptionId: sub.id,
            status: LeadStatus.AVAILABLE,
            periodStart: now,
            periodEnd: currentPeriodEnd,
          })),
        });
      }

      return sub;
    });

    await this.eventLog.record('subscription.created', 'Subscription', subscription.id, {
      planCode: plan.code,
      status,
      userId: user.id,
    });
    await this.outbox.enqueue('subscription.created', {
      subscriptionId: subscription.id,
      userId: user.id,
      planCode: plan.code,
    });

    return subscription;
  }

  async cancel(user: User) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException({ success: false, message: 'No active subscription to cancel' });
    }

    this.stateMachine.assertTransition(
      this.stateMachine.subscriptionGraph,
      subscription.status,
      SubscriptionStatus.CANCELLED,
    );

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELLED, cancelAtPeriodEnd: true },
    });

    await this.eventLog.record('subscription.cancelled', 'Subscription', subscription.id, { userId: user.id });
    await this.outbox.enqueue('subscription.cancelled', { subscriptionId: subscription.id, userId: user.id });

    return updated;
  }

  async handlePaymentWebhook(dto: PaymentWebhookDto) {
    const existing = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId: dto.providerEventId },
    });
    if (existing) {
      return existing;
    }

    const event = await this.prisma.paymentEvent.create({
      data: {
        subscriptionId: dto.subscriptionId ?? null,
        provider: dto.provider,
        providerEventId: dto.providerEventId,
        type: dto.type,
        payload: dto.payload as Prisma.InputJsonValue,
      },
    });

    if (dto.subscriptionId) {
      await this.applyPaymentEventEffects(dto.subscriptionId, dto.type);
    }

    await this.eventLog.record('payment.webhook', 'PaymentEvent', event.id, {
      provider: dto.provider,
      type: dto.type,
      subscriptionId: dto.subscriptionId ?? null,
    });

    return event;
  }

  private async applyPaymentEventEffects(subscriptionId: string, type: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) {
      return;
    }

    let nextStatus: SubscriptionStatus | null = null;
    switch (type) {
      case 'invoice.paid':
      case 'payment.succeeded':
        nextStatus = SubscriptionStatus.ACTIVE;
        break;
      case 'invoice.payment_failed':
      case 'payment.failed':
        nextStatus = SubscriptionStatus.PAST_DUE;
        break;
      case 'subscription.cancelled':
        nextStatus = SubscriptionStatus.CANCELLED;
        break;
      default:
        return;
    }

    if (
      nextStatus &&
      this.stateMachine.canTransition(this.stateMachine.subscriptionGraph, subscription.status, nextStatus)
    ) {
      await this.prisma.subscription.update({ where: { id: subscriptionId }, data: { status: nextStatus } });
    }
  }

  /** Records metered usage for pay-per-item billing (design_model|hd_export|ai_generation|render). */
  async recordUsage(userId: string, meterKey: string, designId?: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });

    return this.prisma.usageEvent.create({
      data: {
        userId,
        subscriptionId: subscription?.id ?? null,
        designId: designId ?? null,
        meterKey,
        quantity: 1,
      },
    });
  }

  /**
   * Consumes one AVAILABLE lead from the jeweler's active subscription for a design request
   * delivery. Returns null when there is no active subscription or no lead left in the current
   * period, so the caller (Atelier design-request delivery) can decide whether to block delivery
   * or charge a per-lead overage via `extraLeadPrice`.
   */
  async consumeLeadForDelivery(jewelerUserId: string, designRequestId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId: jewelerUserId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      return null;
    }

    const lead = await this.prisma.lead.findFirst({
      where: { subscriptionId: subscription.id, status: LeadStatus.AVAILABLE, periodEnd: { gte: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    if (!lead) {
      return null;
    }

    const consumed = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { status: LeadStatus.CONSUMED, consumedAt: new Date(), sourceRequestId: designRequestId },
    });

    await this.eventLog.record('lead.consumed', 'Lead', consumed.id, {
      subscriptionId: subscription.id,
      designRequestId,
    });

    return consumed;
  }
}
