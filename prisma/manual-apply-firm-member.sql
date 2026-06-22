-- Idempotent catch-up for migration 20260622000000_firm_member_rbac.
-- Safe to run multiple times. Paste into Neon → SQL Editor → Run.

-- FirmRole enum (CREATE TYPE has no IF NOT EXISTS — guard it).
DO $$ BEGIN
  CREATE TYPE "FirmRole" AS ENUM ('PARTNER', 'ANALYST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FirmMember table.
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
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
