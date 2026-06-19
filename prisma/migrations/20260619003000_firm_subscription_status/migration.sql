-- Track the firm's platform-subscription status (driven by the subscription
-- lifecycle webhook: active | trialing | past_due | canceled | unpaid).
ALTER TABLE "Firm" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'none';
