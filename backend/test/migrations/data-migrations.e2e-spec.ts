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

  it("references to another user's upload are removed, the owner's own references are kept", async () => {
    db = await scratchDatabase('mig_media_owner');
    db.migrateTo('20261012110000_media_reviews_outbox_hardening');
    const victim = await insertUser(null, '2026-01-01 10:00:00');
    const other = await insertUser(null, '2026-01-01 10:00:00');
    const upload = async (owner: string) => {
      const id = randomUUID();
      await db.sql.$executeRawUnsafe(
        `INSERT INTO "uploads" ("id", "ownerUserId", "bucket", "objectKey", "mimeType", "sizeBytes", "status")
         VALUES ($1::uuid, $2::uuid, 'local-dev', $3, 'image/png', 10, 'READY')`,
        id,
        owner,
        `local/${id}.png`,
      );
      return id;
    };
    const victimUpload = await upload(victim);
    const ownUpload = await upload(other);

    const itemType = randomUUID();
    await db.sql.$executeRawUnsafe(`INSERT INTO "item_types" ("id", "code", "labelHe") VALUES ($1::uuid, 'MIGRING', 'טבעת')`, itemType);
    const design = async (thumbnail: string) => {
      const id = randomUUID();
      await db.sql.$executeRawUnsafe(
        `INSERT INTO "designs" ("id", "ownerUserId", "itemTypeId", "parameters", "thumbnailUploadId", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, '{}'::jsonb, $4::uuid, now())`,
        id,
        other,
        itemType,
        thumbnail,
      );
      return id;
    };
    const stolenThumb = await design(victimUpload);
    const ownThumb = await design(ownUpload);
    await db.sql.$executeRawUnsafe(`UPDATE "users" SET "avatarUploadId" = $1::uuid WHERE "id" = $2::uuid`, victimUpload, other);
    const conversation = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "conversations" ("id", "designId", "updatedAt") VALUES ($1::uuid, $2::uuid, now())`,
      conversation,
      ownThumb,
    );
    const message = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "messages" ("id", "conversationId", "senderId", "type", "imageUploadId")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'IMAGE', $4::uuid)`,
      message,
      conversation,
      other,
      victimUpload,
    );

    db.migrateTo('20261012120000_cross_owner_media_cleanup');

    const thumbs = await db.sql.$queryRawUnsafe<Array<{ id: string; thumbnailUploadId: string | null }>>(
      `SELECT "id", "thumbnailUploadId" FROM "designs"`,
    );
    const byId = new Map(thumbs.map((row) => [row.id, row.thumbnailUploadId]));
    expect(byId.get(stolenThumb)).toBeNull();
    expect(byId.get(ownThumb)).toBe(ownUpload);
    const [user] = await db.sql.$queryRawUnsafe<Array<{ avatarUploadId: string | null }>>(
      `SELECT "avatarUploadId" FROM "users" WHERE "id" = $1::uuid`,
      other,
    );
    expect(user.avatarUploadId).toBeNull();
    const [msg] = await db.sql.$queryRawUnsafe<Array<{ imageUploadId: string | null }>>(
      `SELECT "imageUploadId" FROM "messages" WHERE "id" = $1::uuid`,
      message,
    );
    expect(msg.imageUploadId).toBeNull();
  });

  it('duplicate live subscriptions from before the guard keep only the newest live; the database then refuses a second one', async () => {
    db = await scratchDatabase('mig_live_subscription');
    db.migrateTo('20261012120000_cross_owner_media_cleanup');
    const user = await insertUser(null, '2026-01-01 10:00:00');
    const plan = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "plan_catalog" ("id", "code", "role", "nameHe", "billingCycle", "price", "currency", "inclusions")
       VALUES ($1::uuid, 'MIG_PLAN', 'DESIGNER', 'תוכנית', 'MONTHLY', 0, 'ILS', '{}'::jsonb)`,
      plan,
    );
    const subscription = async (createdAt: string) => {
      const id = randomUUID();
      await db.sql.$executeRawUnsafe(
        `INSERT INTO "subscriptions" ("id", "userId", "planId", "role", "status", "billingCycle", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'DESIGNER', 'ACTIVE', 'MONTHLY', now(), now() + interval '30 days', $4::timestamp, now())`,
        id,
        user,
        plan,
        createdAt,
      );
      return id;
    };
    const older = await subscription('2026-02-01 10:00:00');
    const newer = await subscription('2026-03-01 10:00:00');

    db.migrateTo('20261012130000_billing_correctness');

    const rows = await db.sql.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      `SELECT "id", "status"::text AS "status" FROM "subscriptions" WHERE "userId" = $1::uuid`,
      user,
    );
    const status = new Map(rows.map((row) => [row.id, row.status]));
    expect(status.get(newer)).toBe('ACTIVE');
    expect(status.get(older)).toBe('CANCELLED');
    await expect(subscription('2026-04-01 10:00:00')).rejects.toThrow();
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
    const [stamp] = await db.sql.$queryRawUnsafe<Array<{ updatedAt: Date }>>(
      `SELECT "updatedAt" FROM "app_configs" WHERE "key" = 'upload_limits'`,
    );
    // Stored as UTC wall-clock like every Prisma DateTime (not shifted by the session time zone).
    expect(Math.abs(stamp.updatedAt.getTime() - Date.now())).toBeLessThan(5 * 60_000);
  });
});
