-- Business type / industry on the org — drives the metric registry + Navi-score
-- benchmarks. NULL = not yet chosen (treated as 'generic').
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "industry" TEXT;
