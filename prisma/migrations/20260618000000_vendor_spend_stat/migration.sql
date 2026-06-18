-- Peer-benchmark aggregates (histogram of distinct-org counts per vendor/segment/
-- spend bucket). Privacy-preserving: no amounts tied to an org, no org identity.
CREATE TABLE "VendorSpendStat" (
    "id" TEXT NOT NULL,
    "vendorKey" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "bucket" INTEGER NOT NULL,
    "orgs" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSpendStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorSpendStat_vendorKey_segment_bucket_key" ON "VendorSpendStat"("vendorKey", "segment", "bucket");

CREATE INDEX "VendorSpendStat_segment_vendorKey_idx" ON "VendorSpendStat"("segment", "vendorKey");
