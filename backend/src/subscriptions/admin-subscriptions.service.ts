import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma, Subscription, SubscriptionStatus, User, UserRole } from '@prisma/client';
import { EventLogService } from '../audit/event-log.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { lockSubscription, lockUser } from '../database/row-locks';
import { sqlTimestamp } from '../database/sql-time';
import { DAY_MS } from './billing-periods';
import { RENEW_AHEAD_MS } from './cardcom-payments.service';
import { AddLeadsDto, AdminCancelSubscriptionDto, AdminSubscriptionsQueryDto, ExtendSubscriptionDto } from './dto/admin-subscriptions.dto';

type Tx = Prisma.TransactionClient;

const LIVE: SubscriptionStatus[] = [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];

const ROW = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  plan: { select: { code: true, nameHe: true, leadQuota: true } },
  pendingPlan: { select: { code: true, nameHe: true } },
} satisfies Prisma.SubscriptionInclude;

type Row = Prisma.SubscriptionGetPayload<{ include: typeof ROW }>;
type LeadCounts = { total: number; used: number; reserved: number; available: number; refunded: number };

const notLive = () =>
  new ConflictException({ success: false, message: 'This plan has ended (or its period is over)', code: 'SUBSCRIPTION_NOT_LIVE' });

/**
 * The pricing table's "leads: counting, quotas and plan validity" for the admin: every plan with
 * when it ends and, for jewelers, the leads used and left in the current period; and the admin's
 * actions on one plan — extend it, add leads for this period, end it. Each action runs under the
 * owner's lock (the same lock payments and cancellations take), is written to the audit log in the
 * same transaction, and is applied once per requestId.
 */
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly eventLog: EventLogService,
  ) {}

  async list(query: AdminSubscriptionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const status = query.status ?? 'live';
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(status === 'live' ? { status: { in: LIVE } } : status === 'all' ? {} : { status }),
      user: { deletedAt: null, ...this.search(query.q) },
    };
    const [total, subs] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: ROW,
        // Live plans: the soonest to end first (what needs attention); otherwise the newest first.
        orderBy: status === 'live' ? [{ currentPeriodEnd: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items: await this.rows(subs) };
  }

  /** Days added to the current period (and to a trial); this period's leads stay usable until the new end. */
  async extend(admin: User, id: string, dto: ExtendSubscriptionDto) {
    const now = new Date();
    const applied = await this.act(admin, id, 'subscription.extended', dto, async (tx, sub) => {
      if (!isLive(sub, now) || sub.status === SubscriptionStatus.PAST_DUE) throw notLive();
      // A paid plan's renewal is charged in its last hours under an id made of the period end; moving
      // the end then could charge the card twice (an answer that was lost is looked up by that id).
      if (sub.paymentMethodId && sub.price.greaterThan(0) && sub.currentPeriodEnd.getTime() - RENEW_AHEAD_MS <= now.getTime()) {
        throw new ConflictException({
          success: false,
          message: 'The renewal of this plan is being charged now; extend it after the renewal',
          code: 'RENEWAL_IN_PROGRESS',
        });
      }
      const added = dto.days * DAY_MS;
      const end = new Date(sub.currentPeriodEnd.getTime() + added);
      const trialEndsAt = sub.status === SubscriptionStatus.TRIALING && sub.trialEndsAt ? new Date(sub.trialEndsAt.getTime() + added) : sub.trialEndsAt;
      await tx.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: end, trialEndsAt } });
      // The leads of this period end with it (they are allocated with the period's end).
      await tx.lead.updateMany({ where: { subscriptionId: sub.id, periodEnd: sub.currentPeriodEnd }, data: { periodEnd: end } });
      return {
        before: { currentPeriodEnd: sub.currentPeriodEnd.toISOString(), trialEndsAt: sub.trialEndsAt?.toISOString() ?? null },
        after: { currentPeriodEnd: end.toISOString(), trialEndsAt: trialEndsAt?.toISOString() ?? null, days: dto.days },
      };
    });
    if (applied) await this.eventLog.record('subscription.extended', 'Subscription', id, { days: dto.days, by: admin.id });
    return this.view(id);
  }

  /** Leads added to a jeweler's plan, usable until the end of the current period. */
  async addLeads(admin: User, id: string, dto: AddLeadsDto) {
    const now = new Date();
    const applied = await this.act(admin, id, 'subscription.leads_added', dto, async (tx, sub) => {
      if (sub.role !== UserRole.JEWELER) {
        throw new ConflictException({ success: false, message: 'Leads belong to jewelers\' plans', code: 'LEADS_NOT_APPLICABLE' });
      }
      if (!isLive(sub, now)) throw notLive();
      const periodEnd = periodEndOf(sub);
      await tx.lead.createMany({
        data: Array.from({ length: dto.count }, () => ({ subscriptionId: sub.id, status: LeadStatus.AVAILABLE, periodStart: now, periodEnd })),
      });
      return { before: null, after: { count: dto.count, periodEnd: periodEnd.toISOString() } };
    });
    if (applied) await this.eventLog.record('subscription.leads_added', 'Subscription', id, { count: dto.count, by: admin.id });
    return this.view(id);
  }

  /**
   * Ends a plan for its owner: at the end of the period (nothing renews; a past-due plan, with no
   * paid time left, ends now) or at once (what it includes stops now; money is refunded separately).
   */
  async cancel(admin: User, id: string, dto: AdminCancelSubscriptionDto) {
    const applied = await this.act(admin, id, 'subscription.cancelled_by_admin', dto, async (tx, sub) => {
      if (!LIVE.includes(sub.status)) throw notLive();
      const now = dto.immediately || sub.status === SubscriptionStatus.PAST_DUE;
      await tx.subscription.update({
        where: { id: sub.id },
        data: now
          ? { status: SubscriptionStatus.CANCELLED, cancelAtPeriodEnd: true, pendingPlanId: null }
          : { cancelAtPeriodEnd: true, pendingPlanId: null },
      });
      // Cancelling it with the provider was asked for when it was first set to end.
      if (!sub.cancelAtPeriodEnd) {
        await this.outbox.enqueue('subscription.cancelled', { subscriptionId: sub.id, userId: sub.userId, reason: 'admin' }, tx);
      }
      return {
        before: { status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd },
        after: { immediately: now, status: now ? SubscriptionStatus.CANCELLED : sub.status },
      };
    });
    if (applied) await this.eventLog.record('subscription.cancelled', 'Subscription', id, { by: admin.id, immediately: dto.immediately });
    return this.view(id);
  }

  /**
   * Runs one admin action on a plan under its owner's lock, recording it (with its reason) in the
   * audit log in the same transaction. A requestId already recorded for this plan and action is not applied again
   * (false); a plan that does not exist is a 404.
   */
  private async act(
    admin: User,
    id: string,
    action: string,
    { reason, requestId }: { reason: string; requestId?: string },
    apply: (tx: Tx, sub: Subscription) => Promise<{ before: Prisma.InputJsonValue | null; after: Record<string, unknown> }>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.subscription.findUnique({ where: { id }, select: { userId: true } });
      if (!owner) throw new NotFoundException({ success: false, message: 'Subscription not found' });
      await lockUser(tx, owner.userId);
      await lockSubscription(tx, id);
      if (requestId) {
        const done = await tx.auditLog.count({ where: { entityType: 'Subscription', entityId: id, action, after: { path: ['requestId'], equals: requestId } } });
        if (done > 0) return false;
      }
      const sub = await tx.subscription.findUniqueOrThrow({ where: { id } });
      const change = await apply(tx, sub);
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action,
          entityType: 'Subscription',
          entityId: id,
          before: change.before ?? Prisma.JsonNull,
          after: { ...change.after, reason, ...(requestId ? { requestId } : {}) } as Prisma.InputJsonValue,
        },
      });
      return true;
    });
  }

  private async view(id: string) {
    const sub = await this.prisma.subscription.findUniqueOrThrow({ where: { id }, include: ROW });
    return (await this.rows([sub]))[0];
  }

  private async rows(subs: Row[]) {
    const counts = await this.leadCounts(subs.filter((sub) => sub.role === UserRole.JEWELER).map((sub) => sub.id));
    return subs.map((sub) => ({
      id: sub.id,
      user: {
        id: sub.user.id,
        email: sub.user.email,
        name: [sub.user.firstName, sub.user.lastName].filter(Boolean).join(' ') || null,
        phone: sub.user.phone,
      },
      role: sub.role,
      plan: { code: sub.plan.code, nameHe: sub.plan.nameHe },
      pendingPlan: sub.pendingPlan,
      status: sub.status,
      price: Number(sub.price),
      currency: sub.currency,
      billingCycle: sub.billingCycle,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      trialEndsAt: sub.trialEndsAt,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      hasCard: Boolean(sub.paymentMethodId),
      createdAt: sub.createdAt,
      leads:
        sub.role === UserRole.JEWELER
          ? { quota: sub.plan.leadQuota, ...(counts.get(sub.id) ?? { total: 0, used: 0, reserved: 0, available: 0, refunded: 0 }) }
          : null,
    }));
  }

  /**
   * Each plan's leads in its current period — the one containing now, or, for a plan whose period
   * is over, its last one. One query for the whole page.
   */
  private async leadCounts(ids: string[]): Promise<Map<string, LeadCounts>> {
    const counts = new Map<string, LeadCounts>();
    if (ids.length === 0) return counts;
    const now = sqlTimestamp(new Date());
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: LeadStatus; n: number }>>`
      SELECT l."subscriptionId"::text AS id, l."status" AS status, count(*)::int AS n
        FROM "leads" l
        JOIN "subscriptions" s ON s."id" = l."subscriptionId"
       WHERE l."subscriptionId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
         AND l."periodStart" <= LEAST(${now}, s."currentPeriodEnd" - interval '1 millisecond')
         AND l."periodEnd" >= LEAST(${now}, s."currentPeriodEnd" - interval '1 millisecond')
       GROUP BY 1, 2`;
    for (const row of rows) {
      const entry = counts.get(row.id) ?? { total: 0, used: 0, reserved: 0, available: 0, refunded: 0 };
      entry.total += row.n;
      if (row.status === LeadStatus.CONSUMED) entry.used += row.n;
      else if (row.status === LeadStatus.RESERVED) entry.reserved += row.n;
      else if (row.status === LeadStatus.AVAILABLE) entry.available += row.n;
      else entry.refunded += row.n;
      counts.set(row.id, entry);
    }
    return counts;
  }

  /** Part of the e-mail, the name, or the phone number (also as dialled locally, 05x…). */
  private search(q: string | undefined): Prisma.UserWhereInput {
    const text = q?.trim();
    if (!text) return {};
    const digits = text.replace(/\D/g, '').replace(/^0/, '');
    return {
      OR: [
        { email: { contains: text, mode: 'insensitive' } },
        { firstName: { contains: text, mode: 'insensitive' } },
        { lastName: { contains: text, mode: 'insensitive' } },
        ...(digits.length >= 6 ? [{ phone: { contains: digits } }] : []),
      ],
    };
  }
}

/** Whether the plan gives anything right now (the same rule as entitlements). */
function isLive(sub: Subscription, now: Date): boolean {
  if (sub.status === SubscriptionStatus.TRIALING) return Boolean(sub.trialEndsAt && sub.trialEndsAt > now);
  return (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.PAST_DUE) && sub.currentPeriodEnd > now;
}

function periodEndOf(sub: Subscription): Date {
  return sub.status === SubscriptionStatus.TRIALING && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd;
}
