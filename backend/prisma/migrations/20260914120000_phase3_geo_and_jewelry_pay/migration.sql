-- AlterTable
ALTER TABLE "jeweler_profiles" ADD COLUMN "latitude" DECIMAL(9,6);
ALTER TABLE "jeweler_profiles" ADD COLUMN "longitude" DECIMAL(9,6);

-- CreateIndex
CREATE INDEX "jeweler_profiles_latitude_longitude_idx" ON "jeweler_profiles"("latitude", "longitude");

-- CreateEnum
CREATE TYPE "JewelryPaymentStatus" AS ENUM ('REQUIRES_CONFIRMATION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "jewelry_payment_intents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quoteId" UUID,
    "designId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "JewelryPaymentStatus" NOT NULL DEFAULT 'REQUIRES_CONFIRMATION',
    "clientSecret" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jewelry_payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jewelry_payment_intents_userId_createdAt_idx" ON "jewelry_payment_intents"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "jewelry_payment_intents_quoteId_idx" ON "jewelry_payment_intents"("quoteId");

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN "jewelryPaymentIntentId" UUID;

-- CreateIndex
CREATE INDEX "payment_events_jewelryPaymentIntentId_idx" ON "payment_events"("jewelryPaymentIntentId");

-- AddForeignKey
ALTER TABLE "jewelry_payment_intents" ADD CONSTRAINT "jewelry_payment_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jewelry_payment_intents" ADD CONSTRAINT "jewelry_payment_intents_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_jewelryPaymentIntentId_fkey" FOREIGN KEY ("jewelryPaymentIntentId") REFERENCES "jewelry_payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
