-- One account per external identity: concurrent first sign-ins can no longer create duplicates.
-- Existing duplicates would make the index fail and block the deploy: the oldest account keeps
-- the identity, later duplicates keep all their data but are unlinked (their subject is renamed),
-- so they can still sign in with a password or a reset link. The lock keeps instances that still
-- run the old code from adding a duplicate before the index exists.
SET LOCAL lock_timeout = '10s';

LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "users" AS u
SET "authProviderSub" = u."authProviderSub" || ':duplicate:' || u."id"
WHERE u."authProviderSub" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "users" AS older
    WHERE older."authProvider" = u."authProvider"
      AND older."authProviderSub" = u."authProviderSub"
      AND (older."createdAt", older."id") < (u."createdAt", u."id")
  );

CREATE UNIQUE INDEX "users_authProvider_authProviderSub_key" ON "users"("authProvider", "authProviderSub");
