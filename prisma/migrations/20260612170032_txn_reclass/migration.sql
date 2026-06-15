-- AlterTable
ALTER TABLE "TxnClassification" ADD COLUMN     "category" TEXT,
ALTER COLUMN "expenseClass" DROP NOT NULL;
