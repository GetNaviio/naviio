-- Firm billing: the two go-to-market options.
--   white_label      (Option 1): firm pays $799 for up to 10 client orgs,
--                     $59/org beyond 10, does not charge clients (commission 0).
--   white_label_saas (Option 2): firm pays $997 for up to 25 client orgs and
--                     resells to clients; Naviio takes a 15% commission on
--                     client payments via Stripe Connect application fees.
ALTER TABLE "Firm" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'white_label';
ALTER TABLE "Firm" ADD COLUMN "baseFeeCents" INTEGER NOT NULL DEFAULT 79900;
ALTER TABLE "Firm" ADD COLUMN "includedOrgs" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Firm" ADD COLUMN "overagePerOrgCents" INTEGER NOT NULL DEFAULT 5900;
ALTER TABLE "Firm" ADD COLUMN "commissionPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Firm" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Firm" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Firm" ADD COLUMN "stripeConnectAccountId" TEXT;
ALTER TABLE "Firm" ADD COLUMN "connectStatus" TEXT NOT NULL DEFAULT 'none';
