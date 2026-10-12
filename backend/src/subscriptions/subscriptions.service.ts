import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LeadStatus, PlanCatalog, Prisma, Subscription, SubscriptionStatus, User, UserRole } from '@prisma/client';
import { EventLogService } from '../audit/event-log.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { sqlTimestamp } from '../database/sql-time';
import { EntitlementsService, entitledSubscriptionWhere } from '../entitlements/entitlements.service';
import { billingCyclePeriodMs, DAY_MS } from './billing-periods';
import { SubscribeDto } from './dto/subscription.dto';

/** Statuses that still occupy the user's single subscription slot until the lifecycle sweep. */
const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

export type LeadDeliveryOutcome = 'CONSUMED' | 'OVERAGE' | 'NO_LEADS' | 'NO_SUBSCRIPTION';

type Tx = Prisma.TransactionClient;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly eventLog: EventLogService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async listPlans(role?: UserRole) {
    return this.prisma.planCatalog.findMany({
      where: { isActive: true, ...(role ? { role } : {}) },
      orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
      include: { entitlements: { include: { entitlement: true } } },
    });
  }

  async me(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: { in: LIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
  }

  async entitlementsMe(userId: string) {
    const keys = await this.entitlements.listActiveKeys(userId);
    return { keys };
  }

  /** Allocates the plan's lead quota for one billing period. */
  async allocateLeads(tx: Tx, subscription: Pick<Subscription, 'id'>, plan: PlanCatalog, start: Date, end: Date) {
    if (plan.leadQuota <= 0) {
      return;
    }
    await tx.lead.createMany({
      data: Array.from({ length: plan.leadQuota }, () => ({
        subscriptionId: subscription.id,
        status: LeadStatus.AVAILABLE,
        periodStart: start,
        periodEnd: end,
      })),
    });
  }

  /**
   * Starts a subscription without any payment only when that is legitimate: a free plan, or the
   * user's first trial for that role. Anything else needs a confirmed payment (402); paid
   * activation arrives exclusively through the signed payment webhook. A per-user row lock keeps
   * concurrent calls from creating two live subscriptions.
   */
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

    const now = new Date();
    const subscription = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${user.id}::uuid FOR UPDATE`;

      const live = await tx.subscription.findFirst({
        where: { userId: user.id, status: { in: LIVE_STATUSES } },
      });
      if (live) {
        throw new ConflictException({
          success: false,
          message: 'An active subscription already exists; cancel it before subscribing to a new plan',
          code: 'SUBSCRIPTION_EXISTS',
        });
      }

      let status: SubscriptionStatus | null = null;
      let trialEndsAt: Date | null = null;
      let currentPeriodEnd: Date | null = null;

      if (plan.trialDays > 0) {
        const previousTrials = await tx.subscription.count({
          where: { userId: user.id, role: plan.role, trialEndsAt: { not: null } },
        });
        if (previousTrials === 0) {
          status = SubscriptionStatus.TRIALING;
          trialEndsAt = new Date(now.getTime() + plan.trialDays * DAY_MS);
          currentPeriodEnd = trialEndsAt;
        }
      }

      if (!status) {
        if (!plan.price.isZero()) {
          throw new HttpException(
            {
              success: false,
              message: 'This plan requires payment',
              code: 'PAYMENT_REQUIRED',
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
        status = SubscriptionStatus.ACTIVE;
        currentPeriodEnd = new Date(now.getTime() + billingCyclePeriodMs(plan.billingCycle));
      }

      const sub = await tx.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          role: plan.role,
          status,
          billingCycle: plan.billingCycle,
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: currentPeriodEnd as Date,
        },
      });
      await this.allocateLeads(tx, sub, plan, now, currentPeriodEnd as Date);
      return sub;
    });

    await this.eventLog.record('subscription.created', 'Subscription', subscription.id, {
      planCode: plan.code,
      status: subscription.status,
      userId: user.id,
    });
    await this.outbox.enqueue('subscription.created', {
      subscriptionId: subscription.id,
      userId: user.id,
      planCode: plan.code,
    });

    return subscription;
  }

  /** Stops renewal; access continues until the end of the paid-for / trial period. */
  async cancel(user: User) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: LIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException({ success: false, message: 'No active subscription to cancel' });
    }
    if (subscription.cancelAtPeriodEnd) {
      return subscription;
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    await this.eventLog.record('subscription.cancelled', 'Subscription', subscription.id, {
      userId: user.id,
      effectiveAt: updated.status === SubscriptionStatus.TRIALING ? updated.trialEndsAt : updated.currentPeriodEnd,
    });
    await this.outbox.enqueue('subscription.cancelled', { subscriptionId: subscription.id, userId: user.id });

    return updated;
  }

  /** Records metered usage for pay-per-item billing (design_model|hd_export|ai_generation|render). */
  async recordUsage(userId: string, meterKey: string, designId?: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: entitledSubscriptionWhere(userId),
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
   * Meters one lead for delivering a design request to a jeweler. The lead row is claimed with
   * FOR UPDATE SKIP LOCKED, so two simultaneous deliveries never consume the same lead. When no
   * lead is left, a plan with an overage price records a LeadOverageCharge (only when
   * `chargeOverage` is set, i.e. quota enforcement is on).
   */
  async consumeLeadForDelivery(
    tx: Tx,
    jewelerUserId: string,
    designRequestId: string,
    chargeOverage: boolean,
  ): Promise<LeadDeliveryOutcome> {
    const now = new Date();
    const subscription = await tx.subscription.findFirst({
      where: entitledSubscriptionWhere(jewelerUserId, now),
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    if (!subscription) {
      return 'NO_SUBSCRIPTION';
    }

    const claimed = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "leads"
         SET "status" = 'CONSUMED', "consumedAt" = ${sqlTimestamp(now)}, "sourceRequestId" = ${designRequestId}::uuid
       WHERE "id" = (
         SELECT "id" FROM "leads"
          WHERE "subscriptionId" = ${subscription.id}::uuid
            AND "status" = 'AVAILABLE'
            AND "periodEnd" >= ${sqlTimestamp(now)}
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
      RETURNING "id"`;
    if (claimed.length === 1) {
      // Same transaction as the claim: a rolled-back delivery leaves no "consumed" trace.
      await tx.eventLog.create({
        data: {
          eventKey: 'lead.consumed',
          entityType: 'Lead',
          entityId: claimed[0].id,
          payload: { subscriptionId: subscription.id, designRequestId },
        },
      });
      return 'CONSUMED';
    }

    if (chargeOverage && subscription.plan.extraLeadPrice) {
      await tx.leadOverageCharge.create({
        data: {
          subscriptionId: subscription.id,
          amount: subscription.plan.extraLeadPrice,
          currency: subscription.plan.currency,
        },
      });
      return 'OVERAGE';
    }
    return 'NO_LEADS';
  }
}
