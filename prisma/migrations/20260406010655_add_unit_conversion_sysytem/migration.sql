/*
  Warnings:

  - Added the required column `productName` to the `SaleLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitQty` to the `SaleLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitname` to the `SaleLine` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerGST" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT;

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "productName" TEXT NOT NULL,
ADD COLUMN     "unitQty" INTEGER NOT NULL,
ADD COLUMN     "unitname" TEXT NOT NULL;
