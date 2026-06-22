-- Stripe payouts that settled into the connected bank, for reconciling bank
-- deposits against payouts (so a payout isn't counted as revenue twice).
CREATE TABLE IF NOT EXISTS "StripePayout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripePayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StripePayout_orgId_payoutId_key" ON "StripePayout"("orgId", "payoutId");
CREATE INDEX IF NOT EXISTS "StripePayout_orgId_arrivalDate_idx" ON "StripePayout"("orgId", "arrivalDate");
