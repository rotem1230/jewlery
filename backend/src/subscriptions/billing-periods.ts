import { BillingCycle } from '@prisma/client';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Grace after a missed renewal before a PAST_DUE subscription expires. */
export const PAST_DUE_GRACE_MS = 7 * DAY_MS;

export function billingCyclePeriodMs(cycle: BillingCycle): number {
  switch (cycle) {
    case BillingCycle.ANNUAL:
      return 365 * DAY_MS;
    case BillingCycle.QUARTERLY:
      return 91 * DAY_MS;
    case BillingCycle.MONTHLY:
    case BillingCycle.PER_ITEM:
    case BillingCycle.PER_LEAD:
    default:
      return 30 * DAY_MS;
  }
}
