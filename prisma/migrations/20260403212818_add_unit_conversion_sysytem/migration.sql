/*
  Warnings:

  - The primary key for the `ProductPriceHistory` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Purchase` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "PurchaseBatch" DROP CONSTRAINT "PurchaseBatch_purchaseId_fkey";

-- AlterTable
ALTER TABLE "ProductPriceHistory" DROP CONSTRAINT "ProductPriceHistory_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "ProductPriceHistory_id_seq";

-- AlterTable
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Purchase_id_seq";

-- AlterTable
ALTER TABLE "PurchaseBatch" ALTER COLUMN "purchaseId" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "PurchaseBatch" ADD CONSTRAINT "PurchaseBatch_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
