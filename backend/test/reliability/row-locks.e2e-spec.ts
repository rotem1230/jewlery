import { randomUUID } from 'crypto';
import { lockUser } from '../../src/database/row-locks';
import { holdInTransaction, waitForLockWaiters } from '../utils/db-locks';
import { createTestApp, TestApp } from '../utils/test-app';
import { registerVerified } from '../utils/factories';

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`still blocked after ${ms} ms`)), ms)),
  ]);
}

/**
 * Regression: the per-account serialization lock was FOR UPDATE, which also blocks every insert
 * that merely references the account (foreign-key checks take KEY SHARE) — a source of stalls and
 * deadlocks between unrelated requests.
 */
describe('per-account serialization lock', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('serializes writers on one account without blocking rows that only reference it', async () => {
    const user = await registerVerified(t);
    const held = await holdInTransaction(t, (tx) => lockUser(tx, user.id));
    let released = false;
    try {
      const reference = t.prisma.deviceToken.create({
        data: { userId: user.id, token: `tok_${randomUUID()}`, platform: 'ios' },
      });
      await expect(within(reference, 3_000)).resolves.toMatchObject({ userId: user.id });

      const secondWriter = t.prisma.$transaction((tx) => lockUser(tx, user.id));
      await waitForLockWaiters(t, 1);
      await held.release();
      released = true;
      await secondWriter;
    } finally {
      if (!released) {
        await held.release();
      }
    }
  });
});
