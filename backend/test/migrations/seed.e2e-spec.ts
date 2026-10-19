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
    await db.sql.$executeRawUnsafe(`UPDATE "plan_catalog" SET "price" = 59.90 WHERE "code" = 'DESIGNER_PREMIUM_QUARTERLY'`);
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);

    const [flag] = await db.sql.$queryRawUnsafe<Array<{ enabled: boolean }>>(
      `SELECT "enabled" FROM "feature_flags" WHERE "key" = 'phase2_matching'`,
    );
    expect(flag.enabled).toBe(true);
    const [plan] = await db.sql.$queryRawUnsafe<Array<{ price: string }>>(
      `SELECT "price"::text AS "price" FROM "plan_catalog" WHERE "code" = 'DESIGNER_PREMIUM_QUARTERLY'`,
    );
    expect(plan.price).toBe('59.90');
  });

  it('chat system messages are in Hebrew; a re-seed upgrades the old English text but keeps an operator edit', async () => {
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);
    const body = async (eventKey: string) =>
      (
        await db.sql.$queryRawUnsafe<Array<{ body: string }>>(
          `SELECT "body" FROM "system_message_templates" WHERE "eventKey" = $1 AND "locale" = 'he'`,
          eventKey,
        )
      )[0]?.body;
    expect(await body('quote.accepted')).toContain('ההצעה אושרה בהצלחה');
    expect(await body('handoff.created')).toContain('{{whatsappUrl}}');

    await db.sql.$executeRawUnsafe(
      `UPDATE "system_message_templates" SET "body" = 'Custom wording' WHERE "eventKey" = 'quote.accepted'`,
    );
    await db.sql.$executeRawUnsafe(
      `UPDATE "system_message_templates" SET "body" = 'Continue the handoff with {{jewelerName}} on WhatsApp: {{whatsappUrl}}' WHERE "eventKey" = 'handoff.created'`,
    );
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);
    expect(await body('quote.accepted')).toBe('Custom wording');
    expect(await body('handoff.created')).not.toContain('Continue the handoff');
  });

  it('plan features are in Hebrew (English beside them); a re-seed upgrades the old English list but keeps an operator edit', async () => {
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);
    type Inclusions = { bullets: string[]; bulletsEn?: string[] };
    const inclusions = async (code: string) =>
      (
        await db.sql.$queryRawUnsafe<Array<{ inclusions: Inclusions }>>(
          `SELECT "inclusions" FROM "plan_catalog" WHERE "code" = $1`,
          code,
        )
      )[0]?.inclusions;
    const hebrew = /[֐-׿]/;
    const codes = (await db.sql.$queryRawUnsafe<Array<{ code: string }>>(`SELECT "code" FROM "plan_catalog"`)).map((row) => row.code);
    expect(codes.length).toBe(9);
    for (const code of codes) {
      const plan = await inclusions(code);
      expect(plan.bullets.length).toBeGreaterThan(0);
      expect(plan.bullets.every((line) => hebrew.test(line))).toBe(true);
      expect(plan.bulletsEn?.some((line) => hebrew.test(line))).toBe(false);
    }
    const free = await inclusions('DESIGNER_FREE');
    expect(free.bulletsEn).toEqual(['Unlimited draft designs', 'Standard export with watermark']);

    // Production rows were seeded with the English-only list; an operator rewrote another plan's.
    await db.sql.$executeRawUnsafe(
      `UPDATE "plan_catalog" SET "inclusions" = '{"bullets": ["Unlimited draft designs", "Standard export with watermark"]}'::jsonb WHERE "code" = 'DESIGNER_FREE'`,
    );
    await db.sql.$executeRawUnsafe(
      `UPDATE "plan_catalog" SET "inclusions" = '{"bullets": ["מבצע השקה למנויים"]}'::jsonb WHERE "code" = 'DESIGNER_PREMIUM_QUARTERLY'`,
    );
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);

    expect((await inclusions('DESIGNER_FREE')).bullets).toEqual(free.bullets);
    expect(await inclusions('DESIGNER_PREMIUM_QUARTERLY')).toEqual({ bullets: ['מבצע השקה למנויים'] });
  });

  it('the plans are the pricing table of 19.10 (prices in ILS, quotas per period, no paid extra leads)', async () => {
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);
    const plans = await db.sql.$queryRawUnsafe<
      Array<{ code: string; cycle: string; price: string; leads: number; extra: string | null; currency: string; ai: number | null; unlimited: boolean }>
    >(
      `SELECT p."code", p."billingCycle"::text AS "cycle", p."price"::text AS "price", p."leadQuota" AS "leads",
              p."extraLeadPrice"::text AS "extra", p."currency",
              (SELECT pe."limitValue" FROM "plan_entitlements" pe JOIN "entitlement_definitions" e ON e."id" = pe."entitlementId"
                WHERE pe."planId" = p."id" AND e."key" = 'ai_renders') AS "ai",
              coalesce((p."metadata"->>'unlimited')::boolean, false) AS "unlimited"
         FROM "plan_catalog" p WHERE p."isActive" ORDER BY p."role", p."sortOrder"`,
    );
    const row = (code: string, cycle: string, price: string, leads: number, ai: number | null, unlimited = false) =>
      ({ code, cycle, price, leads, extra: null, currency: 'ILS', ai, unlimited });
    expect(plans).toEqual([
      row('DESIGNER_FREE', 'MONTHLY', '0.00', 0, 10),
      row('DESIGNER_PREMIUM_QUARTERLY', 'QUARTERLY', '45.00', 0, 150),
      row('DESIGNER_PREMIUM_ANNUAL', 'ANNUAL', '149.00', 0, 600),
      row('DESIGNER_PREMIUM_UNLIMITED', 'ANNUAL', '299.00', 0, 1200, true),
      row('JEWELER_TRIAL', 'QUARTERLY', '0.00', 3, null),
      row('JEWELER_BASIC_QUARTERLY', 'QUARTERLY', '390.00', 10, null),
      row('JEWELER_PROFESSIONAL', 'QUARTERLY', '525.00', 15, null),
      row('JEWELER_BUSINESS', 'QUARTERLY', '640.00', 20, null),
      row('JEWELER_UNLIMITED', 'QUARTERLY', '990.00', 40, null, true),
    ]);
  });

  it('the ring size chart follows the PRD, and sizes it dropped are no longer offered', async () => {
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);
    // A database seeded before: its US 5.00 row is still active.
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "size_charts" ("id", "itemTypeId", "standard", "sizeCode", "sortOrder", "isActive")
       SELECT gen_random_uuid(), "id", 'US', '5.00', 0, true FROM "item_types" WHERE "code" = 'RING'`,
    );
    expect(seed({ NODE_ENV: 'production' }).ok).toBe(true);
    const active = await db.sql.$queryRawUnsafe<Array<{ standard: string; sizeCode: string }>>(
      `SELECT s."standard", s."sizeCode" FROM "size_charts" s JOIN "item_types" i ON i."id" = s."itemTypeId"
        WHERE i."code" = 'RING' AND s."isActive" ORDER BY s."standard", s."sortOrder"`,
    );
    expect(active.filter((r) => r.standard === 'IL').map((r) => r.sizeCode)).toEqual(['52', '54', '56', '58', '60', '62', '64']);
    expect(active.filter((r) => r.standard === 'US').map((r) => r.sizeCode)).toEqual([
      '6.00',
      '7.00',
      '7.75',
      '8.50',
      '9.25',
      '10.00',
      '10.75',
    ]);
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
