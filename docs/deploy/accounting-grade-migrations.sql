-- ============================================================================
-- Accountant-grade revenue work — apply in the Neon SQL Editor before deploying.
-- Both blocks are idempotent (safe to run more than once).
-- ============================================================================

-- 1) P0-4 — Stripe payout reconciliation table (dedup bank deposits vs payouts)
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

-- 2) P0-3 — Revenue-recognition service window (ratable / deferred revenue)
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "recognitionStart" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "recognitionEnd" TIMESTAMP(3);
