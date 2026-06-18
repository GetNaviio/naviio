-- Peer-benchmark aggregates for category spend as % of revenue (histogram of
-- distinct-org counts per percent bucket). Same privacy posture as VendorSpendStat.
CREATE TABLE "CategorySpendStat" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "bucket" INTEGER NOT NULL,
    "orgs" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorySpendStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategorySpendStat_category_segment_bucket_key" ON "CategorySpendStat"("category", "segment", "bucket");

CREATE INDEX "CategorySpendStat_segment_category_idx" ON "CategorySpendStat"("segment", "category");
