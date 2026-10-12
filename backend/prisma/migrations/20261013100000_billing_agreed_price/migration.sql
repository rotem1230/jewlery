-- Subscriptions keep the price they were agreed at, so a catalog price change neither blocks the
-- renewals of existing subscribers nor makes a plan agreed free start charging (or the reverse).
-- Payment events keep what they say was paid and for what, for review. Checkout sessions can be
-- marked as paid-but-not-applied (NEEDS_REVIEW) or cancelled (account deleted before payment).
--
-- Deploy note: the new NOT NULL columns are filled here from each subscription's plan; old
-- application instances, which do not set them, must be stopped before this migration runs.

SET lock_timeout = '10s';

-- AlterEnum (PostgreSQL 12+: new values may be added inside the migration's transaction)
ALTER TYPE "CheckoutStatus" ADD VALUE 'NEEDS_REVIEW';
ALTER TYPE "CheckoutStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN     "amount" DECIMAL(12,2),
ADD COLUMN     "checkoutId" UUID,
ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "invoiceId" TEXT;

-- AlterTable: existing subscriptions were agreed at their plan's price.
ALTER TABLE "subscriptions" ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "price" DECIMAL(12,2);

UPDATE "subscriptions" AS s
SET "price" = p."price", "currency" = p."currency"
FROM "plan_catalog" AS p
WHERE p."id" = s."planId";

ALTER TABLE "subscriptions" ALTER COLUMN "currency" SET NOT NULL,
ALTER COLUMN "price" SET NOT NULL;

-- CreateIndex
CREATE INDEX "payment_events_checkoutId_idx" ON "payment_events"("checkoutId");
