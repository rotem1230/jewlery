-- Payments and the plan requirements of the pricing table: refunds (admin), card replacement,
-- the plan chosen for the next renewal, jewelry payments by card with what is owed to each
-- jeweler, AI / storage / traffic costs per user and fair-use alerts. New tables and nullable
-- columns (and one enum value): no rewrite of existing rows.

SET LOCAL lock_timeout = '10s';

-- AlterEnum
ALTER TYPE "JewelryPaymentStatus" ADD VALUE 'REFUNDED';
-- AlterTable
ALTER TABLE "ai_generation_jobs" ADD COLUMN     "costIls" DECIMAL(10,4);
-- AlterTable
ALTER TABLE "jewelry_payment_intents" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "transactionId" TEXT;
-- AlterTable
ALTER TABLE "payment_methods" ADD COLUMN     "cardLast4" TEXT;
-- AlterTable
ALTER TABLE "subscription_invoices" ADD COLUMN     "provider" TEXT;
-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "pendingPlanId" UUID;
-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "subscriptionInvoiceId" UUID,
    "jewelryPaymentIntentId" UUID,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "failureReason" TEXT,
    "requestedById" UUID,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "jeweler_payouts" (
    "id" UUID NOT NULL,
    "jewelryPaymentIntentId" UUID NOT NULL,
    "jewelerUserId" UUID NOT NULL,
    "quoteId" UUID,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidReference" TEXT,
    "markedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jeweler_payouts_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "media_traffic_daily" (
    "ownerUserId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "media_traffic_daily_pkey" PRIMARY KEY ("ownerUserId","day")
);
-- CreateTable
CREATE TABLE "usage_alerts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usage_alerts_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "payment_method_updates" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "paymentUrl" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "payment_method_updates_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_requestId_key" ON "payment_refunds"("requestId");
-- CreateIndex
CREATE INDEX "payment_refunds_subscriptionInvoiceId_idx" ON "payment_refunds"("subscriptionInvoiceId");
-- CreateIndex
CREATE INDEX "payment_refunds_jewelryPaymentIntentId_idx" ON "payment_refunds"("jewelryPaymentIntentId");
-- CreateIndex
CREATE INDEX "payment_refunds_createdAt_idx" ON "payment_refunds"("createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "jeweler_payouts_jewelryPaymentIntentId_key" ON "jeweler_payouts"("jewelryPaymentIntentId");
-- CreateIndex
CREATE INDEX "jeweler_payouts_jewelerUserId_status_idx" ON "jeweler_payouts"("jewelerUserId", "status");
-- CreateIndex
CREATE INDEX "jeweler_payouts_status_createdAt_idx" ON "jeweler_payouts"("status", "createdAt");
-- CreateIndex
CREATE INDEX "media_traffic_daily_day_idx" ON "media_traffic_daily"("day");
-- CreateIndex
CREATE INDEX "usage_alerts_createdAt_idx" ON "usage_alerts"("createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "usage_alerts_userId_kind_periodKey_key" ON "usage_alerts"("userId", "kind", "periodKey");
-- CreateIndex
CREATE UNIQUE INDEX "payment_method_updates_providerRef_key" ON "payment_method_updates"("providerRef");
-- CreateIndex
CREATE INDEX "payment_method_updates_userId_createdAt_idx" ON "payment_method_updates"("userId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "jewelry_payment_intents_providerRef_key" ON "jewelry_payment_intents"("providerRef");
-- CreateIndex
CREATE INDEX "subscription_invoices_paidAt_idx" ON "subscription_invoices"("paidAt");
-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "plan_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_subscriptionInvoiceId_fkey" FOREIGN KEY ("subscriptionInvoiceId") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_jewelryPaymentIntentId_fkey" FOREIGN KEY ("jewelryPaymentIntentId") REFERENCES "jewelry_payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "jeweler_payouts" ADD CONSTRAINT "jeweler_payouts_jewelryPaymentIntentId_fkey" FOREIGN KEY ("jewelryPaymentIntentId") REFERENCES "jewelry_payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "jeweler_payouts" ADD CONSTRAINT "jeweler_payouts_jewelerUserId_fkey" FOREIGN KEY ("jewelerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "media_traffic_daily" ADD CONSTRAINT "media_traffic_daily_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "usage_alerts" ADD CONSTRAINT "usage_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payment_method_updates" ADD CONSTRAINT "payment_method_updates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payment_method_updates" ADD CONSTRAINT "payment_method_updates_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
