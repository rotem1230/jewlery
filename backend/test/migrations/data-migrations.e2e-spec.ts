import { randomUUID } from 'crypto';
import { scratchDatabase, ScratchDatabase } from '../utils/migration-db';

/**
 * Data migrations are tested against the data production may already hold: migrate a scratch
 * database to the state before the migration, insert that data, then apply the migration.
 */
describe('data migrations on existing data', () => {
  let db: ScratchDatabase;

  afterEach(async () => {
    await db?.drop();
  });

  async function insertUser(sub: string | null, createdAt: string): Promise<string> {
    const id = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "users" ("id", "email", "passwordHash", "authProvider", "authProviderSub", "createdAt", "updatedAt")
       VALUES ($1::uuid, $2, 'x', 'GOOGLE', $3, $4::timestamp, $4::timestamp)`,
      id,
      `${id}@example.test`,
      sub,
      createdAt,
    );
    return id;
  }

  it('the unique external-identity index is created even when duplicates already exist', async () => {
    db = await scratchDatabase('mig_identity');
    db.migrateTo('20260914120000_phase3_geo_and_jewelry_pay');
    const original = await insertUser('google-sub-1', '2026-01-01 10:00:00');
    const duplicate = await insertUser('google-sub-1', '2026-02-01 10:00:00');
    const unrelated = await insertUser('google-sub-2', '2026-03-01 10:00:00');

    db.migrateTo('20261012100000_auth_identity_unique');

    const rows = await db.sql.$queryRawUnsafe<Array<{ id: string; authProviderSub: string | null; email: string }>>(
      `SELECT "id", "authProviderSub", "email" FROM "users" ORDER BY "createdAt"`,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    // The first account keeps the identity; the duplicate is kept (data intact) but unlinked.
    expect(byId.get(original)?.authProviderSub).toBe('google-sub-1');
    expect(byId.get(duplicate)?.authProviderSub).not.toBe('google-sub-1');
    expect(byId.get(duplicate)?.email).toBe(`${duplicate}@example.test`);
    expect(byId.get(unrelated)?.authProviderSub).toBe('google-sub-2');
  });

  it("duplicate reviews by one author keep only the newest, and ratings are recomputed", async () => {
    db = await scratchDatabase('mig_reviews');
    db.migrateTo('20261012100000_auth_identity_unique');
    const jeweler = await insertUser(null, '2026-01-01 10:00:00');
    const author = await insertUser(null, '2026-01-01 10:00:00');
    const other = await insertUser(null, '2026-01-01 10:00:00');
    const region = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "regions" ("id", "code", "labelHe") VALUES ($1::uuid, 'MIG', 'מרכז')`,
      region,
    );
    const profile = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "jeweler_profiles" ("id", "userId", "businessName", "regionId", "phone", "ratingAvg", "reviewCount", "updatedAt")
       VALUES ($1::uuid, $2::uuid, 'Atelier', $3::uuid, '+972500000000', 3.00, 3, now())`,
      profile,
      jeweler,
      region,
    );
    const review = (authorId: string, rating: number, createdAt: string) =>
      db.sql.$executeRawUnsafe(
        `INSERT INTO "reviews" ("id", "jewelerProfileId", "authorUserId", "reviewerName", "rating", "comment", "createdAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'R', $4, 'c', $5::timestamp)`,
        randomUUID(),
        profile,
        authorId,
        rating,
        createdAt,
      );
    await review(author, 1, '2026-02-01 10:00:00');
    await review(author, 5, '2026-03-01 10:00:00');
    await review(other, 3, '2026-02-15 10:00:00');

    db.migrateTo('20261012110000_media_reviews_outbox_hardening');

    const reviews = await db.sql.$queryRawUnsafe<Array<{ authorUserId: string; rating: number }>>(
      `SELECT "authorUserId", "rating" FROM "reviews" WHERE "jewelerProfileId" = $1::uuid ORDER BY "rating"`,
      profile,
    );
    expect(reviews).toEqual([
      { authorUserId: other, rating: 3 },
      { authorUserId: author, rating: 5 },
    ]);
    const [stats] = await db.sql.$queryRawUnsafe<Array<{ ratingAvg: string; reviewCount: number }>>(
      `SELECT "ratingAvg"::text AS "ratingAvg", "reviewCount" FROM "jeweler_profiles" WHERE "id" = $1::uuid`,
      profile,
    );
    expect(stats).toEqual({ ratingAvg: '4.00', reviewCount: 2 });
  });

  it('pending outbox events stay deliverable and voice-note types are allowed after the upgrade', async () => {
    db = await scratchDatabase('mig_outbox');
    db.migrateTo('20261012100000_auth_identity_unique');
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "outbox_events" ("id", "type", "payload") VALUES ($1::uuid, 'notification.push', '{}'::jsonb)`,
      randomUUID(),
    );
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "app_configs" ("id", "key", "value", "version", "updatedAt")
       VALUES ($1::uuid, 'upload_limits', '{"allowedMimeTypes":["image/png"]}'::jsonb, 4, now())`,
      randomUUID(),
    );

    db.migrateTo('20261012110000_media_reviews_outbox_hardening');

    const [event] = await db.sql.$queryRawUnsafe<Array<{ nextAttemptAt: Date | null; deadAt: Date | null }>>(
      `SELECT "nextAttemptAt", "deadAt" FROM "outbox_events"`,
    );
    expect(event).toEqual({ nextAttemptAt: null, deadAt: null });
    const [config] = await db.sql.$queryRawUnsafe<Array<{ value: { allowedMimeTypes: string[] }; version: number }>>(
      `SELECT "value", "version" FROM "app_configs" WHERE "key" = 'upload_limits'`,
    );
    expect(config.value.allowedMimeTypes).toEqual(expect.arrayContaining(['image/png', 'audio/m4a', 'audio/mpeg']));
    expect(config.version).toBe(5);
  });
});
