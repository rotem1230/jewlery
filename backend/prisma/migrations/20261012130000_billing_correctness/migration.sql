-- Billing correctness: payment event outcomes (nothing paid is silently dropped), provider event ids
-- unique per provider, one renewal per paid invoice, server-side checkout sessions for paid plans,
-- trial grants that survive account deletion, and the design request behind an overage charge.

SET LOCAL lock_timeout = '10s';

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('OPEN', 'COMPLETED');

-- DropIndex
DROP INDEX "payment_events_providerEventId_key";

-- AlterTable
ALTER TABLE "lead_overage_charges" ADD COLUMN     "designRequestId" UUID;

-- AlterTable: events recorded before outcomes existed are LEGACY (whether they were applied is
-- unknown); from now on every writer states the outcome, so the column has no default.
ALTER TABLE "payment_events" ADD COLUMN     "note" TEXT,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "payment_events" ALTER COLUMN "outcome" DROP DEFAULT;

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'OPEN',
    "subscriptionId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "providerInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_grants" (
    "id" UUID NOT NULL,
    "identityHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkout_sessions_userId_status_idx" ON "checkout_sessions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_subscriptionId_providerInvoiceId_key" ON "subscription_invoices"("subscriptionId", "providerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "trial_grants_identityHash_role_key" ON "trial_grants"("identityHash", "role");

-- CreateIndex
CREATE INDEX "payment_events_outcome_idx" ON "payment_events"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_providerEventId_key" ON "payment_events"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one live subscription per user, enforced by the database as well as by the user-row
-- lock every writer takes (Prisma cannot express a partial index; it is maintained here).
-- Users who ended up with several live subscriptions (concurrent subscribe calls before the lock
-- existed) keep one: a paid plan in good standing (ACTIVE), else a paid one past due, else the
-- newest (a trial or a free plan). The others are closed as superseded and logged in event_logs,
-- so a double charge can be refunded.
LOCK TABLE "subscriptions" IN SHARE ROW EXCLUSIVE MODE;
WITH ranked AS (
  SELECT s."id", s."userId",
         first_value(s."id") OVER live_first AS "keptId",
         row_number() OVER live_first AS "rank"
  FROM "subscriptions" AS s
  JOIN "plan_catalog" AS p ON p."id" = s."planId"
  WHERE s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
  WINDOW live_first AS (
    PARTITION BY s."userId"
    ORDER BY (s."status" = 'ACTIVE' AND p."price" > 0) DESC,
             (s."status" = 'PAST_DUE' AND p."price" > 0) DESC,
             s."createdAt" DESC, s."id" DESC
  )
), superseded AS (
  UPDATE "subscriptions" AS s
  SET "status" = 'CANCELLED', "updatedAt" = timezone('UTC', now())
  FROM ranked
  WHERE ranked."id" = s."id" AND ranked."rank" > 1
  RETURNING s."id", s."userId", ranked."keptId"
)
INSERT INTO "event_logs" ("id", "eventKey", "entityType", "entityId", "payload", "createdAt")
SELECT gen_random_uuid(), 'subscription.superseded_by_migration', 'Subscription', superseded."id"::text,
       jsonb_build_object('userId', superseded."userId", 'keptSubscriptionId', superseded."keptId"),
       timezone('UTC', now())
FROM superseded;
CREATE UNIQUE INDEX "subscriptions_one_live_per_user" ON "subscriptions"("userId")
  WHERE "status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE');
