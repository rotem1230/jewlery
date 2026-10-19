-- The pricing table of 19.10: plans can be billed every quarter, and the plans it replaces are no
-- longer offered. Their existing subscriptions are untouched (they run until they end). The new
-- plans themselves are reference data, created by the seed.

SET LOCAL lock_timeout = '10s';

-- AlterEnum (the new value is not used in this transaction)
ALTER TYPE "BillingCycle" ADD VALUE 'QUARTERLY' AFTER 'MONTHLY';

-- The previous paid plans and the monthly free jeweler plan are withdrawn from the offer.
UPDATE "plan_catalog" SET "isActive" = false WHERE "code" IN ('DESIGNER_PRO', 'JEWELER_BASIC', 'JEWELER_ACTIVE');
