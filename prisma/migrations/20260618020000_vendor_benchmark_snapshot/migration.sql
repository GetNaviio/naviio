-- Monthly snapshot of the vendor peer-median per size band, for price trends.
CREATE TABLE "VendorBenchmarkSnapshot" (
    "id" TEXT NOT NULL,
    "vendorKey" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "median" INTEGER NOT NULL,
    "orgs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBenchmarkSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorBenchmarkSnapshot_vendorKey_segment_period_key" ON "VendorBenchmarkSnapshot"("vendorKey", "segment", "period");

CREATE INDEX "VendorBenchmarkSnapshot_vendorKey_segment_idx" ON "VendorBenchmarkSnapshot"("vendorKey", "segment");
