/*
  Warnings:

  - You are about to alter the column `mrr` on the `MrrSnapshot` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(19,4)`.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(19,4)`.
  - A unique constraint covering the columns `[orgId,externalId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Transaction_externalId_key";

-- AlterTable
ALTER TABLE "MrrSnapshot" ALTER COLUMN "mrr" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(19,4);

-- CreateIndex
CREATE INDEX "Transaction_orgId_type_date_idx" ON "Transaction"("orgId", "type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_orgId_externalId_key" ON "Transaction"("orgId", "externalId");
