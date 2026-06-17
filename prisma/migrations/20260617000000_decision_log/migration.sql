-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "question" TEXT,
    "verdict" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "answer" JSONB NOT NULL,
    "outcome" TEXT,
    "outcomeNote" TEXT,
    "outcomeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionLog_orgId_idx" ON "DecisionLog"("orgId");

-- CreateIndex
CREATE INDEX "DecisionLog_orgId_template_idx" ON "DecisionLog"("orgId", "template");

-- AddForeignKey
ALTER TABLE "DecisionLog" ADD CONSTRAINT "DecisionLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
