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

  async function insertPlan(code: string, price: number): Promise<string> {
    const id = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "plan_catalog" ("id", "code", "role", "nameHe", "billingCycle", "price", "currency", "inclusions")
       VALUES ($1::uuid, $2, 'DESIGNER', 'תוכנית', 'MONTHLY', $3, 'ILS', '{}'::jsonb)`,
      id,
      code,
      price,
    );
    return id;
  }

  async function insertSubscription(userId: string, planId: string, status: string, createdAt: string): Promise<string> {
    const id = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "subscriptions" ("id", "userId", "planId", "role", "status", "billingCycle", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'DESIGNER', $4::"SubscriptionStatus", 'MONTHLY', now(), now() + interval '30 days', $5::timestamp, now())`,
      id,
      userId,
      planId,
      status,
      createdAt,
    );
    return id;
  }

  async function subscriptionStatuses(userId: string): Promise<Map<string, string>> {
    const rows = await db.sql.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      `SELECT "id", "status"::text AS "status" FROM "subscriptions" WHERE "userId" = $1::uuid`,
      userId,
    );
    return new Map(rows.map((row) => [row.id, row.status]));
  }

  it('duplicate live subscriptions from before the guard keep one live (the paid one, else the newest); the database then refuses a second one', async () => {
    db = await scratchDatabase('mig_live_subscription');
    db.migrateTo('20261012120000_cross_owner_media_cleanup');
    const free = await insertPlan('MIG_FREE', 0);
    const paid = await insertPlan('MIG_PAID', 10);

    const payer = await insertUser(null, '2026-01-01 10:00:00');
    const paying = await insertSubscription(payer, paid, 'ACTIVE', '2026-02-01 10:00:00');
    const laterTrial = await insertSubscription(payer, paid, 'TRIALING', '2026-03-01 10:00:00');
    const newestFree = await insertSubscription(payer, free, 'ACTIVE', '2026-04-01 10:00:00');

    const freeOnly = await insertUser(null, '2026-01-01 10:00:00');
    const oldest = await insertSubscription(freeOnly, free, 'ACTIVE', '2026-02-01 10:00:00');
    const middle = await insertSubscription(freeOnly, free, 'ACTIVE', '2026-03-01 10:00:00');
    const newest = await insertSubscription(freeOnly, free, 'ACTIVE', '2026-04-01 10:00:00');

    db.migrateTo('20261012130000_billing_correctness');

    const payerStatus = await subscriptionStatuses(payer);
    expect(payerStatus.get(paying)).toBe('ACTIVE');
    expect(payerStatus.get(laterTrial)).toBe('CANCELLED');
    expect(payerStatus.get(newestFree)).toBe('CANCELLED');
    const freeStatus = await subscriptionStatuses(freeOnly);
    expect(freeStatus.get(newest)).toBe('ACTIVE');
    expect(freeStatus.get(middle)).toBe('CANCELLED');
    expect(freeStatus.get(oldest)).toBe('CANCELLED');
    await expect(insertSubscription(freeOnly, free, 'ACTIVE', '2026-05-01 10:00:00')).rejects.toThrow();
  });

  it('among paid duplicates, the one still in good standing (ACTIVE) is kept over a newer past-due one', async () => {
    db = await scratchDatabase('mig_live_standing');
    db.migrateTo('20261012120000_cross_owner_media_cleanup');
    const paid = await insertPlan('MIG_PAID', 10);
    const user = await insertUser(null, '2026-01-01 10:00:00');
    const active = await insertSubscription(user, paid, 'ACTIVE', '2026-02-01 10:00:00');
    const pastDue = await insertSubscription(user, paid, 'PAST_DUE', '2026-03-01 10:00:00');

    db.migrateTo('20261012130000_billing_correctness');

    const status = await subscriptionStatuses(user);
    expect(status.get(active)).toBe('ACTIVE');
    expect(status.get(pastDue)).toBe('CANCELLED');
    const [log] = await db.sql.$queryRawUnsafe<Array<{ payload: { keptSubscriptionId: string } }>>(
      `SELECT "payload" FROM "event_logs" WHERE "eventKey" = 'subscription.superseded_by_migration' AND "entityId" = $1`,
      pastDue,
    );
    expect(log.payload.keptSubscriptionId).toBe(active);
  });

  it('payment events recorded before outcomes existed are marked LEGACY, not claimed as applied', async () => {
    db = await scratchDatabase('mig_payment_outcome');
    db.migrateTo('20261012120000_cross_owner_media_cleanup');
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "payment_events" ("id", "provider", "providerEventId", "type", "payload")
       VALUES ($1::uuid, 'stripe', 'evt_legacy', 'invoice.paid', '{}'::jsonb)`,
      randomUUID(),
    );

    db.migrateTo('20261012130000_billing_correctness');

    const [row] = await db.sql.$queryRawUnsafe<Array<{ outcome: string }>>(
      `SELECT "outcome" FROM "payment_events" WHERE "providerEventId" = 'evt_legacy'`,
    );
    expect(row.outcome).toBe('LEGACY');
  });

  it('existing subscriptions keep the price of their plan as the agreed price', async () => {
    db = await scratchDatabase('mig_agreed_price');
    db.migrateTo('20261012130000_billing_correctness');
    const paid = await insertPlan('MIG_PAID', 10);
    const user = await insertUser(null, '2026-01-01 10:00:00');
    const sub = await insertSubscription(user, paid, 'ACTIVE', '2026-02-01 10:00:00');

    db.migrateTo('20261013100000_billing_agreed_price');

    const [row] = await db.sql.$queryRawUnsafe<Array<{ price: string; currency: string }>>(
      `SELECT "price"::text AS "price", "currency" FROM "subscriptions" WHERE "id" = $1::uuid`,
      sub,
    );
    expect(row).toEqual({ price: '10.00', currency: 'ILS' });
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
  it("each jeweler's existing deliveries get the order status of what already happened to them", async () => {
    db = await scratchDatabase('mig_order_status');
    db.migrateTo('20261013110000_session_version');
    const designer = await insertUser(null, '2026-01-01 10:00:00');
    const region = randomUUID();
    await db.sql.$executeRawUnsafe(`INSERT INTO "regions" ("id", "code", "labelHe") VALUES ($1::uuid, 'MIG_REGION', 'אזור')`, region);
    const jeweler = async () => {
      const userId = await insertUser(null, '2026-01-01 10:00:00');
      const profileId = randomUUID();
      await db.sql.$executeRawUnsafe(
        `INSERT INTO "jeweler_profiles" ("id", "userId", "businessName", "regionId", "phone", "updatedAt")
         VALUES ($1::uuid, $2::uuid, 'Atelier', $3::uuid, '+972501234567', now())`,
        profileId,
        userId,
        region,
      );
      return { userId, profileId };
    };
    const itemType = randomUUID();
    await db.sql.$executeRawUnsafe(`INSERT INTO "item_types" ("id", "code", "labelHe") VALUES ($1::uuid, 'MIGORDER', 'טבעת')`, itemType);
    const design = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "designs" ("id", "ownerUserId", "itemTypeId", "parameters", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, '{}'::jsonb, now())`,
      design,
      designer,
      itemType,
    );
    const conversation = randomUUID();
    await db.sql.$executeRawUnsafe(
      `INSERT INTO "conversations" ("id", "designId", "updatedAt") VALUES ($1::uuid, $2::uuid, now())`,
      conversation,
      design,
    );
    const request = async (status: string) => {
      const id = randomUUID();
      await db.sql.$executeRawUnsafe(
        `INSERT INTO "design_requests" ("id", "designId", "requesterId", "mode", "status", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'TARGETED', $4::"DesignRequestStatus", now())`,
        id,
        design,
        designer,
        status,
      );
      return id;
    };
    const deliver = (requestId: string, profileId: string) =>
      db.sql.$executeRawUnsafe(
        `INSERT INTO "design_request_targets" ("requestId", "jewelerProfileId") VALUES ($1::uuid, $2::uuid)`,
        requestId,
        profileId,
      );
    const quote = (requestId: string, authorUserId: string, status: string) =>
      db.sql.$executeRawUnsafe(
        `INSERT INTO "quotes" ("id", "conversationId", "designId", "designRequestId", "authorUserId", "materialsCost", "laborCost",
                               "totalPrice", "currency", "etaBusinessDays", "status", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 100, 50, 150, 'ILS', 10, $6::"QuoteStatus", now())`,
        randomUUID(),
        conversation,
        design,
        requestId,
        authorUserId,
        status,
      );

    const winner = await jeweler();
    const loser = await jeweler();
    const pending = await jeweler();
    const untouched = await jeweler();
    const completed = await request('COMPLETED');
    await deliver(completed, winner.profileId);
    await deliver(completed, loser.profileId);
    await quote(completed, winner.userId, 'ACCEPTED');
    await quote(completed, loser.userId, 'DECLINED');
    const open = await request('QUOTE_SUBMITTED');
    await deliver(open, pending.profileId);
    await deliver(open, untouched.profileId);
    await quote(open, pending.userId, 'PENDING');
    const cancelled = await request('CANCELLED');
    await deliver(cancelled, untouched.profileId);

    db.migrateTo('20261013120000_jeweler_order_status');

    const rows = await db.sql.$queryRawUnsafe<Array<{ requestId: string; jewelerProfileId: string; status: string }>>(
      `SELECT "requestId", "jewelerProfileId", "status"::text AS "status" FROM "design_request_targets"`,
    );
    const status = (requestId: string, profileId: string) =>
      rows.find((row) => row.requestId === requestId && row.jewelerProfileId === profileId)?.status;
    expect(status(completed, winner.profileId)).toBe('COMPLETED');
    expect(status(completed, loser.profileId)).toBe('CLOSED');
    expect(status(open, pending.profileId)).toBe('QUOTE_SUBMITTED');
    expect(status(open, untouched.profileId)).toBe('NEW');
    expect(status(cancelled, untouched.profileId)).toBe('CLOSED');
  });
});
