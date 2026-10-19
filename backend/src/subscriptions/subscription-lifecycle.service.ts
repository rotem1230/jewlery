import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { billingCyclePeriodMs, PAST_DUE_GRACE_MS } from './billing-periods';
import { CardcomPaymentsService } from './cardcom-payments.service';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Moves subscriptions through time: ended trials expire, cancelled subscriptions end at period
 * end, free plans renew, unpaid paid plans become PAST_DUE and then EXPIRED after the grace
 * period. Free or paid is the price agreed for the subscription, not today's catalog price.
 * Entitlement checks are time-bound on their own; this sweep keeps statuses truthful.
 */
@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly cardcom: CardcomPaymentsService,
  ) {}

  async runOnce(now: Date = new Date()): Promise<void> {
    const expiredTrials = await this.prisma.subscription.updateMany({
      where: { status: SubscriptionStatus.TRIALING, trialEndsAt: { lte: now } },
      data: { status: SubscriptionStatus.EXPIRED },
    });

    const ended = await this.prisma.subscription.updateMany({
      where: { status: SubscriptionStatus.ACTIVE, cancelAtPeriodEnd: true, currentPeriodEnd: { lte: now } },
      data: { status: SubscriptionStatus.CANCELLED },
    });

    const renewed = await this.renewFreePlans(now);
    // Paid plans with a saved card are charged before an unpaid one is marked past due.
    const charged = await this.cardcom.renewDue(now);

    const pastDue = await this.prisma.subscription.updateMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: now },
        price: { gt: 0 },
      },
      data: { status: SubscriptionStatus.PAST_DUE },
    });

    const lapsed = await this.prisma.subscription.updateMany({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodEnd: { lte: new Date(now.getTime() - PAST_DUE_GRACE_MS) },
      },
      data: { status: SubscriptionStatus.EXPIRED },
    });

    const changed = expiredTrials.count + ended.count + renewed + charged + pastDue.count + lapsed.count;
    if (changed > 0) {
      this.logger.log(
        `Subscription sweep: ${expiredTrials.count} trials expired, ${ended.count} cancelled, ${renewed} renewed, ` +
          `${charged} renewed by card, ${pastDue.count} past due, ${lapsed.count} lapsed`,
      );
    }
  }

  private async renewFreePlans(now: Date): Promise<number> {
    const due = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: now },
        price: { equals: new Prisma.Decimal(0) },
      },
      include: { plan: true },
    });

    let renewed = 0;
    for (const sub of due) {
      const period = billingCyclePeriodMs(sub.billingCycle);
      let start = sub.currentPeriodEnd;
      while (start.getTime() + period <= now.getTime()) {
        start = new Date(start.getTime() + period);
      }
      const end = new Date(start.getTime() + period);
      await this.prisma.$transaction(async (tx) => {
        // Conditional on the period we read, so two sweeps never renew the same period twice.
        const claimed = await tx.subscription.updateMany({
          where: {
            id: sub.id,
            currentPeriodEnd: sub.currentPeriodEnd,
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: false,
          },
          data: { currentPeriodStart: start, currentPeriodEnd: end },
        });
        if (claimed.count === 1) {
          await this.subscriptions.allocateLeads(tx, sub, sub.plan, start, end);
          renewed += 1;
        }
      });
    }
    return renewed;
  }
}
