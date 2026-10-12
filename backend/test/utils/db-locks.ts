import { Prisma } from '@prisma/client';
import { TestApp } from './test-app';

type LockableTable = 'designs' | 'quotes' | 'conversations' | 'users';
type Tx = Prisma.TransactionClient;

export type HeldLock = {
  /** Optionally runs `work` inside the locking transaction, then commits and releases the lock. */
  release: (work?: (tx: Tx) => Promise<unknown>) => Promise<void>;
};

/**
 * Holds a row lock from a separate transaction, so a test can stop a request at a precise point
 * (when it reaches that row) and change the data underneath it before letting it continue.
 */
export async function lockRow(t: TestApp, table: LockableTable, id: string): Promise<HeldLock> {
  let release!: (work?: (tx: Tx) => Promise<unknown>) => void;
  const released = new Promise<((tx: Tx) => Promise<unknown>) | undefined>((resolve) => {
    release = resolve;
  });
  let onLocked!: () => void;
  let onFailed!: (err: unknown) => void;
  const locked = new Promise<void>((resolve, reject) => {
    onLocked = resolve;
    onFailed = reject;
  });

  const done = t.prisma
    .$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(`SELECT 1 FROM "${table}" WHERE id = $1::uuid FOR UPDATE`, id);
        onLocked();
        const work = await released;
        if (work) {
          await work(tx);
        }
      },
      { maxWait: 5_000, timeout: 30_000 },
    )
    .catch((err: unknown) => {
      onFailed(err);
      throw err;
    });

  await locked;
  return {
    release: async (work) => {
      release(work);
      await done;
    },
  };
}

/** Waits until at least `count` statements in this database are blocked waiting for a lock. */
export async function waitForLockWaiters(t: TestApp, count: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await t.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (row.n >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${count} statement(s) blocked on a lock`);
}

/**
 * Runs `work` in a transaction and keeps it open (uncommitted, holding its locks) until released,
 * e.g. an insert another request will collide with only once this transaction commits.
 */
export async function holdInTransaction(t: TestApp, work: (tx: Tx) => Promise<unknown>): Promise<HeldLock> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let onReady!: () => void;
  let onFailed!: (err: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    onReady = resolve;
    onFailed = reject;
  });
  const done = t.prisma
    .$transaction(
      async (tx) => {
        await work(tx);
        onReady();
        await released;
      },
      { maxWait: 5_000, timeout: 30_000 },
    )
    .catch((err: unknown) => {
      onFailed(err);
      throw err;
    });
  await ready;
  return {
    release: async () => {
      release();
      await done;
    },
  };
}
