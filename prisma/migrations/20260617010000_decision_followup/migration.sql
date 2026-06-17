-- AlterTable: track when Navi has already prompted for an outcome, so the
-- follow-up cron never double-pings the same decision.
ALTER TABLE "DecisionLog" ADD COLUMN "followedUpAt" TIMESTAMP(3);
