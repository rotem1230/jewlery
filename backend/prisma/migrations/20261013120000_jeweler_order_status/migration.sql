-- Each jeweler a design request reaches has their own order status (PRD 5.11: New / Quote
-- submitted / Negotiating / Completed, and a request can be declined): the request's single status
-- moved for everyone when one jeweler quoted. A quote also records the design it priced, so it is
-- never accepted for a design changed since.

SET LOCAL lock_timeout = '10s';

-- CreateEnum
CREATE TYPE "RequestTargetStatus" AS ENUM ('NEW', 'QUOTE_SUBMITTED', 'NEGOTIATING', 'COMPLETED', 'DECLINED', 'CLOSED');

-- AlterTable (constant defaults: no table rewrite)
ALTER TABLE "design_request_targets" ADD COLUMN     "status" "RequestTargetStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "designHash" TEXT;

-- Existing deliveries take the status of what already happened to them: the jeweler's accepted
-- quote completed it; a pending quote is submitted; a request that ended otherwise is closed.
UPDATE "design_request_targets" t
   SET "status" = 'COMPLETED'
  FROM "jeweler_profiles" p, "quotes" q
 WHERE p."id" = t."jewelerProfileId"
   AND q."designRequestId" = t."requestId"
   AND q."authorUserId" = p."userId"
   AND q."status" = 'ACCEPTED';

UPDATE "design_request_targets" t
   SET "status" = 'QUOTE_SUBMITTED'
  FROM "jeweler_profiles" p, "quotes" q
 WHERE t."status" = 'NEW'
   AND p."id" = t."jewelerProfileId"
   AND q."designRequestId" = t."requestId"
   AND q."authorUserId" = p."userId"
   AND q."status" = 'PENDING';

UPDATE "design_request_targets" t
   SET "status" = 'CLOSED'
  FROM "design_requests" r
 WHERE t."status" IN ('NEW', 'QUOTE_SUBMITTED')
   AND r."id" = t."requestId"
   AND r."status" IN ('COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateIndex
CREATE INDEX "design_request_targets_jewelerProfileId_status_idx" ON "design_request_targets"("jewelerProfileId", "status");

-- The sweep that expires pending quotes past their validity.
CREATE INDEX "quotes_status_validUntil_idx" ON "quotes"("status", "validUntil");
