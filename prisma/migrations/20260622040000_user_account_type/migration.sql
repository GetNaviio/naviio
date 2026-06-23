-- Onboarding account type: 'owner' (runs a business) or 'advisor' (fractional CFO
-- managing client orgs). NULL = not yet chosen (treated as owner).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" TEXT;
