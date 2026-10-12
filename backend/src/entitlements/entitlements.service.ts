import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * A subscription grants entitlements only while it is inside its paid-for / trial window:
 * TRIALING until trialEndsAt, ACTIVE or PAST_DUE until currentPeriodEnd. The window is checked
 * here (not only by the lifecycle sweep) so access ends on time even if the sweep is late.
 */
export function entitledSubscriptionWhere(userId: string, now: Date = new Date()): Prisma.SubscriptionWhereInput {
  return {
    userId,
    OR: [
      { status: SubscriptionStatus.TRIALING, trialEndsAt: { gt: now } },
      {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        currentPeriodEnd: { gt: now },
      },
    ],
  };
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private async activeSubscriptionsWithEntitlements(userId: string) {
    return this.prisma.subscription.findMany({
      where: entitledSubscriptionWhere(userId),
      include: {
        plan: {
          include: {
            entitlements: { include: { entitlement: true } },
          },
        },
      },
    });
  }

  async listActiveKeys(userId: string): Promise<string[]> {
    const subs = await this.activeSubscriptionsWithEntitlements(userId);
    const keys = new Set<string>();
    for (const sub of subs) {
      for (const planEntitlement of sub.plan.entitlements) {
        keys.add(planEntitlement.entitlement.key);
      }
    }
    return [...keys];
  }

  async has(userId: string, key: string): Promise<boolean> {
    const subs = await this.activeSubscriptionsWithEntitlements(userId);
    return subs.some((sub) =>
      sub.plan.entitlements.some((planEntitlement) => planEntitlement.entitlement.key === key),
    );
  }

  async assert(userId: string, key: string): Promise<void> {
    const allowed = await this.has(userId, key);
    if (!allowed) {
      throw new ForbiddenException({
        success: false,
        message: `Entitlement "${key}" is required`,
        code: 'PAYWALL',
        entitlement: key,
      });
    }
  }
}
