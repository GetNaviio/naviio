-- Firm-level RBAC: PARTNER / ANALYST team members on a firm. The firm owner is
-- implicitly a PARTNER and has no row here.
CREATE TYPE "FirmRole" AS ENUM ('PARTNER', 'ANALYST');

CREATE TABLE "FirmMember" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FirmRole" NOT NULL DEFAULT 'ANALYST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FirmMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FirmMember_firmId_userId_key" ON "FirmMember"("firmId", "userId");
CREATE INDEX "FirmMember_userId_idx" ON "FirmMember"("userId");
ALTER TABLE "FirmMember"
  ADD CONSTRAINT "FirmMember_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
