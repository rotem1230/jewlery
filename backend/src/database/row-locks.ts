import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Serializes, until the transaction ends, the writers that act on one account: quota checks,
 * subscription and checkout changes, token redemption, account deletion.
 *
 * FOR NO KEY UPDATE rather than FOR UPDATE: an insert that merely references the account takes a
 * KEY SHARE lock for its foreign-key check, which FOR UPDATE would block (stalling unrelated
 * requests and deadlocking with ones that lock in the other order). Two lockUser calls on the same
 * account still wait for each other.
 */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
}

/** Same as lockUser, for decisions about one subscription (renewals, overage caps, the sweep). */
export async function lockSubscription(tx: Tx, subscriptionId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "subscriptions" WHERE id = ${subscriptionId}::uuid FOR NO KEY UPDATE`;
}
