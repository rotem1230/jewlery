import { execFileSync } from 'child_process';
import path from 'path';
import { migrationNames, scratchDatabase, ScratchDatabase } from '../utils/migration-db';

const ROOT = path.join(__dirname, '..', '..');

/**
 * Regression: `prisma db seed` created demo accounts with published passwords
 * (designer@dev… / Designer123!) and force-enabled every feature flag on each run, in any
 * environment — including production.
 */
describe('database seed', () => {
  let db: ScratchDatabase;

  beforeEach(async () => {
    db = await scratchDatabase('seed_check');
    db.migrateTo(migrationNames()[migrationNames().length - 1]);
  });

  afterEach(async () => {
    await db.drop();
  });

  function seed(env: Record<string, string>): { ok: boolean; output: string } {
    try {
      const output = execFileSync(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', path.join('prisma', 'seed.ts')],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            DATABASE_URL: db.url,
            TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'CommonJS' }),
            SEED_DEMO_DATA: '',
            ...env,
          },
          stdio: 'pipe',
        },
      );
      return { ok: true, output: output.toString() };
    } catch (err) {
      const failure = err as { stdout?: Buffer; stderr?: Buffer };
      return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  }

  it('the reference seed creates no accounts and never overrides what an operator changed', async () => {
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);
    expect(await db.sql.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "users"`)).toEqual([{ n: 0 }]);
    expect(
      await db.sql.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "plan_catalog"`),
    ).not.toEqual([{ n: 0 }]);

    await db.sql.$executeRawUnsafe(`UPDATE "feature_flags" SET "enabled" = true WHERE "key" = 'phase2_matching'`);
    await db.sql.$executeRawUnsafe(`UPDATE "plan_catalog" SET "price" = 59.90 WHERE "code" = 'DESIGNER_PRO'`);
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);

    const [flag] = await db.sql.$queryRawUnsafe<Array<{ enabled: boolean }>>(
      `SELECT "enabled" FROM "feature_flags" WHERE "key" = 'phase2_matching'`,
    );
    expect(flag.enabled).toBe(true);
    const [plan] = await db.sql.$queryRawUnsafe<Array<{ price: string }>>(
      `SELECT "price"::text AS "price" FROM "plan_catalog" WHERE "code" = 'DESIGNER_PRO'`,
    );
    expect(plan.price).toBe('59.90');
  });

  it('refuses to seed demo accounts in production', async () => {
    const run = seed({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true' });
    expect(run.ok).toBe(false);
    expect(run.output).toMatch(/demo/i);
    expect(await db.sql.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "users"`)).toEqual([{ n: 0 }]);
  });

  it('seeds the demo accounts for local development only when asked to', async () => {
    expect(seed({ NODE_ENV: 'development', SEED_DEMO_DATA: 'true' }).ok).toBe(true);
    const demo = await db.sql.$queryRawUnsafe<Array<{ email: string }>>(
      `SELECT "email" FROM "users" WHERE "email" = 'designer@dev.mailnvosky.local'`,
    );
    expect(demo).toHaveLength(1);
  });
});
