-- Track the org's direct (individual) plan subscription status, set by the
-- plan-billing webhook: active | trialing | past_due | canceled | unpaid.
ALTER TABLE "Organization" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'none';
