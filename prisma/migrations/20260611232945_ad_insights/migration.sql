-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProvider" ADD VALUE 'META_ADS';
ALTER TYPE "IntegrationProvider" ADD VALUE 'GOOGLE_ADS';

-- CreateTable
CREATE TABLE "AdInsight" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "date" TEXT NOT NULL,
    "spend" DECIMAL(19,4) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionValue" DECIMAL(19,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdInsight_orgId_provider_date_idx" ON "AdInsight"("orgId", "provider", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdInsight_orgId_provider_accountId_date_key" ON "AdInsight"("orgId", "provider", "accountId", "date");

-- AddForeignKey
ALTER TABLE "AdInsight" ADD CONSTRAINT "AdInsight_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
