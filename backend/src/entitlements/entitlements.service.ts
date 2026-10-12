import { ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
];

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private async activeSubscriptionsWithEntitlements(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId, status: { in: ACTIVE_SUBSCRIPTION_STATUSES } },
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
