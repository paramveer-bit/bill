-- AlterTable
ALTER TABLE "PurchaseBatch" ADD COLUMN     "conversionQty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "purchasedUnit" TEXT NOT NULL DEFAULT 'pcs';
