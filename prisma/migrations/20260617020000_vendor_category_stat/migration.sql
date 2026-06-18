-- Cross-org community categorization prior. Anonymized: vendorKey + category +
-- count only. No amounts, no org/user identity, no transaction detail.
CREATE TABLE "VendorCategoryStat" (
    "id" TEXT NOT NULL,
    "vendorKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCategoryStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorCategoryStat_vendorKey_category_key" ON "VendorCategoryStat"("vendorKey", "category");

CREATE INDEX "VendorCategoryStat_vendorKey_idx" ON "VendorCategoryStat"("vendorKey");
