-- Annual billing option for firm plans (~2 months free vs monthly).
ALTER TABLE "Firm" ADD COLUMN "billingCycle" TEXT NOT NULL DEFAULT 'monthly';
