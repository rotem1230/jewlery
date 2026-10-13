import { DesignRequestStatus, DesignStatus, Prisma, RequestTargetStatus } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Requests still taking quotes; a design is not delivered twice to a jeweler while one is open. */
export const OPEN_REQUEST_STATUSES: DesignRequestStatus[] = [
  DesignRequestStatus.OPEN,
  DesignRequestStatus.QUOTE_SUBMITTED,
  DesignRequestStatus.NEGOTIATING,
];

/** A jeweler's order still in play (counted as "in progress" on their board). */
export const IN_PROGRESS_ORDER_STATUSES: RequestTargetStatus[] = [
  RequestTargetStatus.QUOTE_SUBMITTED,
  RequestTargetStatus.NEGOTIATING,
];

/**
 * The status the jeweler sees: a New order whose request stopped taking quotes, or whose listing
 * ended (unpublished, removed, expired), is closed for them.
 */
export function effectiveOrderStatus(
  status: RequestTargetStatus,
  requestStatus: DesignRequestStatus,
  design: { status: DesignStatus; expiresAt: Date | null; deletedAt: Date | null },
  now: Date = new Date(),
): RequestTargetStatus {
  if (status !== RequestTargetStatus.NEW) {
    return status;
  }
  const listingLive =
    design.status === DesignStatus.PUBLISHED && !design.deletedAt && (!design.expiresAt || design.expiresAt > now);
  return OPEN_REQUEST_STATUSES.includes(requestStatus) && listingLive ? status : RequestTargetStatus.CLOSED;
}

export type OrderScope = {
  designId: string;
  /** Only these jewelers' deliveries (user ids). */
  jewelerUserIds?: string[];
  /** Every jeweler's but this one's. */
  exceptJewelerUserId?: string;
  /** Only deliveries of requests that still take quotes. */
  openRequestsOnly?: boolean;
};

/**
 * Moves the deliveries of a design's requests (each jeweler's own order, PRD 5.11) from any of
 * `from` to `to`. Runs inside the transaction of the change that causes it, after that change's
 * own locks (quotes and requests are always locked before deliveries).
 */
export async function moveOrders(tx: Tx, scope: OrderScope, from: RequestTargetStatus[], to: RequestTargetStatus): Promise<void> {
  const jeweler: Prisma.JewelerProfileWhereInput = {};
  if (scope.jewelerUserIds) {
    jeweler.userId = { in: scope.jewelerUserIds };
  } else if (scope.exceptJewelerUserId) {
    jeweler.userId = { not: scope.exceptJewelerUserId };
  }
  await tx.designRequestTarget.updateMany({
    where: {
      status: { in: from },
      request: {
        designId: scope.designId,
        ...(scope.openRequestsOnly ? { status: { in: OPEN_REQUEST_STATUSES } } : {}),
      },
      ...(scope.jewelerUserIds || scope.exceptJewelerUserId ? { jewelerProfile: jeweler } : {}),
    },
    data: { status: to, statusChangedAt: new Date() },
  });
}
