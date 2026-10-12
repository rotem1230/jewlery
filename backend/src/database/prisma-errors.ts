import { Prisma } from '@prisma/client';

/** Prisma error codes for failures that a later attempt of the same work can get past. */
const TRANSIENT_PRISMA_CODES = new Set([
  'P1001', // database unreachable
  'P1002', // database timed out
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'P2024', // no connection from the pool in time
  'P2028', // transaction could not start or expired under load
  'P2034', // write conflict or deadlock
]);

/** PostgreSQL SQLSTATEs (surfacing from raw queries) for the same kind of failure. */
const TRANSIENT_SQLSTATES = new Set([
  '40001', // serialization failure
  '40P01', // deadlock detected
  '55P03', // lock not available (lock_timeout)
  '57014', // query cancelled (statement_timeout)
  '57P01', // admin shutdown
]);

/**
 * Whether an error is a passing condition of the database (load, locks, connectivity) rather than
 * something about the work itself: such work should be refused for a retry, not given up on.
 */
export function isTransientDatabaseError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (TRANSIENT_PRISMA_CODES.has(err.code)) {
      return true;
    }
    const sqlState = (err.meta as { code?: unknown } | undefined)?.code;
    return typeof sqlState === 'string' && TRANSIENT_SQLSTATES.has(sqlState);
  }
  return err instanceof Prisma.PrismaClientInitializationError || err instanceof Prisma.PrismaClientRustPanicError;
}
