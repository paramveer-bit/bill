-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "receivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PurchaseBatch" ADD COLUMN     "purchaseUnitCost" DECIMAL(12,2) NOT NULL DEFAULT 0;
