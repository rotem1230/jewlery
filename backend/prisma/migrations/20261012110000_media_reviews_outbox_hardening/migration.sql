-- Media authorization lookups (who references an upload) must not scan whole tables.
CREATE INDEX "users_avatarUploadId_idx" ON "users"("avatarUploadId");
CREATE INDEX "designs_thumbnailUploadId_idx" ON "designs"("thumbnailUploadId");
CREATE INDEX "jeweler_profiles_logoUploadId_idx" ON "jeweler_profiles"("logoUploadId");
CREATE INDEX "portfolio_items_uploadId_idx" ON "portfolio_items"("uploadId");
CREATE INDEX "messages_imageUploadId_idx" ON "messages"("imageUploadId");

-- One review per author per jeweler. An author's older reviews of the same jeweler are superseded
-- by their newest one and removed (kept, they would go on inflating the rating); then every
-- profile's rating is recomputed from the reviews that remain, the way the app computes it. The
-- lock keeps instances that still run the old code from adding a duplicate before the index exists.
LOCK TABLE "reviews" IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM "reviews" AS r
WHERE r."authorUserId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "reviews" AS newer
    WHERE newer."jewelerProfileId" = r."jewelerProfileId"
      AND newer."authorUserId" = r."authorUserId"
      AND (newer."createdAt", newer."id") > (r."createdAt", r."id")
  );
CREATE UNIQUE INDEX "reviews_jewelerProfileId_authorUserId_key" ON "reviews"("jewelerProfileId", "authorUserId");
UPDATE "jeweler_profiles" AS p
SET "ratingAvg" = s."ratingAvg", "reviewCount" = s."reviewCount"
FROM (
  SELECT jp."id",
         COALESCE(ROUND(AVG(r."rating")::numeric, 2), 0) AS "ratingAvg",
         COUNT(r."id")::int AS "reviewCount"
  FROM "jeweler_profiles" AS jp
  LEFT JOIN "reviews" AS r ON r."jewelerProfileId" = jp."id"
  GROUP BY jp."id"
) AS s
WHERE s."id" = p."id"
  AND (p."ratingAvg" IS DISTINCT FROM s."ratingAvg" OR p."reviewCount" IS DISTINCT FROM s."reviewCount");

-- Visualization retention purge marker.
ALTER TABLE "visualization_jobs" ADD COLUMN "purgedAt" TIMESTAMP(3);

-- Outbox: backoff, worker lease and dead-lettering.
ALTER TABLE "outbox_events"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "deadAt" TIMESTAMP(3);
CREATE INDEX "outbox_events_processedAt_deadAt_nextAttemptAt_idx" ON "outbox_events"("processedAt", "deadAt", "nextAttemptAt");

-- Voice notes: the seeded upload_limits row lacked audio types, so every recording was rejected.
UPDATE "app_configs"
SET "value" = jsonb_set(
      "value",
      '{allowedMimeTypes}',
      (
        SELECT jsonb_agg(DISTINCT mime ORDER BY mime)
        FROM jsonb_array_elements_text(
          COALESCE("value" -> 'allowedMimeTypes', '[]'::jsonb)
          || '["audio/m4a","audio/mp4","audio/x-m4a","audio/mpeg","audio/wav"]'::jsonb
        ) AS mime
      )
    ),
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'upload_limits'
  AND jsonb_typeof("value" -> 'allowedMimeTypes') = 'array';
