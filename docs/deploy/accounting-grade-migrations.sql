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

-- 3) Phase 2 — business type / industry on the org (metric registry + Navi-score
--    benchmarks). NULL = not yet chosen (treated as 'generic').
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "industry" TEXT;

-- 4) Onboarding — account type ('owner' | 'advisor'). NULL = treated as owner.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" TEXT;

-- 5) Firm RBAC — FirmMember (PARTNER/ANALYST). Needed by the advisor/firm surface;
--    if this is missing the firm helpers degrade to owner-only, but the team
--    features need it. Idempotent.
DO $$ BEGIN
  CREATE TYPE "FirmRole" AS ENUM ('PARTNER', 'ANALYST');
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS "FirmMember" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FirmRole" NOT NULL DEFAULT 'ANALYST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FirmMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FirmMember_firmId_userId_key" ON "FirmMember"("firmId", "userId");
CREATE INDEX IF NOT EXISTS "FirmMember_userId_idx" ON "FirmMember"("userId");
DO $$ BEGIN
  ALTER TABLE "FirmMember" ADD CONSTRAINT "FirmMember_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
