-- CreateEnum
CREATE TYPE "BudgetLineKind" AS ENUM ('REVENUE', 'COGS', 'OPEX');

-- CreateTable
CREATE TABLE "WorkforceRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "monthlySalary" DECIMAL(19,4) NOT NULL,
    "loadedPct" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "line" "BudgetLineKind" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkforceRole_orgId_idx" ON "WorkforceRole"("orgId");

-- CreateIndex
CREATE INDEX "BudgetLine_orgId_month_idx" ON "BudgetLine"("orgId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_orgId_month_line_key" ON "BudgetLine"("orgId", "month", "line");

-- AddForeignKey
ALTER TABLE "WorkforceRole" ADD CONSTRAINT "WorkforceRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
