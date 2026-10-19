-- Card payments through Cardcom: a checkout keeps the provider's payment page (its LowProfileId,
-- unique, and the address the app opens), and the card saved for renewals (a Cardcom token) is kept
-- in its own table, referenced by the subscription it renews. Nullable columns and a new table: no
-- rewrite of existing rows.

SET LOCAL lock_timeout = '10s';

-- AlterTable
ALTER TABLE "checkout_sessions" ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerRef" TEXT;
-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "paymentMethodId" UUID;
-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "cardExpiry" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "payment_methods_userId_idx" ON "payment_methods"("userId");
-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_providerRef_key" ON "checkout_sessions"("providerRef");
-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
