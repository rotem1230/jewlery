import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutStatus, LeadStatus, PlanCatalog, Prisma, Subscription, SubscriptionStatus, User, UserRole } from '@prisma/client';
import { EventLogService } from '../audit/event-log.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { lockSubscription, lockUser } from '../database/row-locks';
import { sqlTimestamp } from '../database/sql-time';
import { randomUUID } from 'crypto';
import { trialIdentityHash } from './trial-identity';
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
    private readonly config: ConfigService,
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
      await lockUser(tx, user.id);

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
        if (previousTrials === 0 && (await this.claimTrial(tx, user.email, plan.role, now))) {
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
          price: plan.price,
          currency: plan.currency,
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

  /**
   * One trial per mailbox and role, recorded under a keyed hash that outlives the account: deleting
   * the account (or using an alias of the same inbox) does not grant another trial.
   */
  private async claimTrial(tx: Tx, email: string, role: UserRole, now: Date): Promise<boolean> {
    const hash = trialIdentityHash(email, this.trialSecret());
    const claimed = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "trial_grants" ("id", "identityHash", "role", "grantedAt")
      VALUES (${randomUUID()}::uuid, ${hash}, ${role}::"UserRole", ${sqlTimestamp(now)})
      ON CONFLICT ("identityHash", "role") DO NOTHING
      RETURNING "id"`;
    return claimed.length === 1;
  }

  /** Remembers the trials an account used before its e-mail address is erased. */
  async recordTrialsBeforeDeletion(tx: Tx, userId: string, email: string): Promise<void> {
    const trials = await tx.subscription.findMany({
      where: { userId, trialEndsAt: { not: null } },
      select: { role: true },
      distinct: ['role'],
    });
    for (const trial of trials) {
      await this.claimTrial(tx, email, trial.role, new Date());
    }
  }

  private trialSecret(): string {
    return this.config.get<string>('subscriptions.trialHashSecret') || this.config.getOrThrow<string>('jwt.secret');
  }

  /**
   * Stops renewal; access continues until the end of the paid-for / trial period. A past-due
   * subscription has no paid period left, so it ends at once and another plan can be chosen.
   * Decided under the owner's lock, which the payment webhook also holds while it applies a
   * payment: a renewal in flight finishes first, and the decision is made on what it left.
   */
  async cancel(user: User) {
    const { subscription, updated } = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.subscription.findFirst({
        where: { userId: user.id, status: { in: LIVE_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      if (!current) {
        throw new NotFoundException({ success: false, message: 'No active subscription to cancel' });
      }
      if (current.status !== SubscriptionStatus.PAST_DUE && current.cancelAtPeriodEnd) {
        return { subscription: current, updated: null };
      }
      const changed = await tx.subscription.update({
        where: { id: current.id },
        data:
          current.status === SubscriptionStatus.PAST_DUE
            ? { status: SubscriptionStatus.CANCELLED, cancelAtPeriodEnd: true }
            : { cancelAtPeriodEnd: true },
      });
      await this.outbox.enqueue('subscription.cancelled', { subscriptionId: current.id, userId: user.id }, tx);
      return { subscription: current, updated: changed };
    });
    if (!updated) {
      return subscription;
    }

    await this.eventLog.record('subscription.cancelled', 'Subscription', subscription.id, {
      userId: user.id,
      effectiveAt: updated.status === SubscriptionStatus.TRIALING ? updated.trialEndsAt : updated.currentPeriodEnd,
    });
    return updated;
  }

  /**
   * Account deletion: live subscriptions end now and unpaid checkouts are cancelled, so a payment
   * that still arrives for them is held for review instead of activating a plan for a deleted
   * account. The provider is told through the outbox (subscription.cancelled).
   */
  async endForDeletedAccount(tx: Tx, userId: string): Promise<void> {
    const live = await tx.subscription.findMany({
      where: { userId, status: { in: LIVE_STATUSES } },
      select: { id: true },
    });
    if (live.length > 0) {
      await tx.subscription.updateMany({
        where: { id: { in: live.map((sub) => sub.id) } },
        data: { status: SubscriptionStatus.CANCELLED, cancelAtPeriodEnd: true },
      });
      for (const sub of live) {
        await this.outbox.enqueue('subscription.cancelled', { subscriptionId: sub.id, userId, reason: 'account_deleted' }, tx);
      }
    }
    await tx.checkoutSession.updateMany({
      where: { userId, status: CheckoutStatus.OPEN },
      data: { status: CheckoutStatus.CANCELLED },
    });
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
            AND "periodStart" <= ${sqlTimestamp(now)}
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

    const overagePrice = subscription.plan.extraLeadPrice;
    if (chargeOverage && overagePrice && overagePrice.greaterThan(0)) {
      // Serialized per subscription so the cap holds under simultaneous deliveries. Counted over
      // one billing cycle back from now, not from currentPeriodStart: paying the next period early
      // moves that start into the future, which would reset the count.
      await lockSubscription(tx, subscription.id);
      const windowStart = new Date(now.getTime() - billingCyclePeriodMs(subscription.billingCycle));
      const chargedThisCycle = await tx.leadOverageCharge.count({
        where: { subscriptionId: subscription.id, createdAt: { gt: windowStart } },
      });
      if (chargedThisCycle >= this.config.get<number>('leads.overageCapPerPeriod', 50)) {
        return 'NO_LEADS';
      }
      await tx.leadOverageCharge.create({
        data: {
          subscriptionId: subscription.id,
          designRequestId,
          amount: overagePrice,
          currency: subscription.plan.currency,
        },
      });
      return 'OVERAGE';
    }
    return 'NO_LEADS';
  }
}
