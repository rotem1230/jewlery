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

/**
 * A shared hold on the account, for work that must not interleave with a lockUser writer but may
 * run alongside other such readers (refresh rotation vs. ending all sessions).
 */
export async function shareLockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId}::uuid FOR SHARE`;
}

/** Same as lockUser, for changes to one jeweler profile's own content (its portfolio). */
export async function lockJewelerProfile(tx: Tx, profileId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "jeweler_profiles" WHERE id = ${profileId}::uuid FOR NO KEY UPDATE`;
}

/**
 * Serializes, until the transaction ends, the payment events about one provider invoice that have
 * no row to lock in common (a checkout recording its first invoice, and that invoice's own payment
 * notice arriving without a known subscription). Taken after any account lock, never before one.
 */
export async function lockPaymentInvoice(tx: Tx, providerInvoiceId: string): Promise<void> {
  // Selected FROM the function: its own result is void, which Prisma cannot read back.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`payment-invoice:${providerInvoiceId}`}, 0))`;
}
