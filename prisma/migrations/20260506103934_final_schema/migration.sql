/*
  Warnings:

  - You are about to drop the column `initialCollectedAmount` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `initialCollectedKg` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `targetAmount` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `targetKg` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `targetUnit` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `campaignId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `packageKg` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `reviewCount` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `unitPricePerKg` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `cargoCompany` on the `StoreOrder` table. All the data in the column will be lost.
  - You are about to drop the column `deliveredAt` on the `StoreOrder` table. All the data in the column will be lost.
  - You are about to drop the column `shippedAt` on the `StoreOrder` table. All the data in the column will be lost.
  - You are about to drop the column `trackingNumber` on the `StoreOrder` table. All the data in the column will be lost.
  - You are about to drop the column `productCode` on the `StoreOrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `cashDiscountAmount` on the `SystemConfig` table. All the data in the column will be lost.
  - You are about to drop the column `cashDiscountThreshold` on the `SystemConfig` table. All the data in the column will be lost.
  - You are about to drop the column `defaultTargetAmount` on the `SystemConfig` table. All the data in the column will be lost.
  - You are about to drop the column `maxCampaignTargetTL` on the `SystemConfig` table. All the data in the column will be lost.
  - You are about to drop the column `minCampaignTargetKg` on the `SystemConfig` table. All the data in the column will be lost.
  - You are about to drop the column `minCampaignTargetPackages` on the `SystemConfig` table. All the data in the column will be lost.
  - You are about to drop the column `minCampaignTargetTL` on the `SystemConfig` table. All the data in the column will be lost.
  - You are about to drop the `StoreProduct` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[slug]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `price` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED');

-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'INACTIVE';

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "ProductReview" DROP CONSTRAINT "ProductReview_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockAlert" DROP CONSTRAINT "StockAlert_productId_fkey";

-- DropForeignKey
ALTER TABLE "StoreOrderItem" DROP CONSTRAINT "StoreOrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "StoreProduct" DROP CONSTRAINT "StoreProduct_categoryId_fkey";

-- DropIndex
DROP INDEX "OrderItem_productId_idx";

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "initialCollectedAmount",
DROP COLUMN "initialCollectedKg",
DROP COLUMN "targetAmount",
DROP COLUMN "targetKg",
DROP COLUMN "targetUnit";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "campaignId",
DROP COLUMN "packageKg",
DROP COLUMN "quantity",
DROP COLUMN "reviewCount",
DROP COLUMN "unitPricePerKg",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "comparePrice" DECIMAL(65,30),
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nutritionValues" JSONB,
ADD COLUMN     "price" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "showInDonation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showInStore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StoreOrder" DROP COLUMN "cargoCompany",
DROP COLUMN "deliveredAt",
DROP COLUMN "shippedAt",
DROP COLUMN "trackingNumber";

-- AlterTable
ALTER TABLE "StoreOrderItem" DROP COLUMN "productCode";

-- AlterTable
ALTER TABLE "SystemConfig" DROP COLUMN "cashDiscountAmount",
DROP COLUMN "cashDiscountThreshold",
DROP COLUMN "defaultTargetAmount",
DROP COLUMN "maxCampaignTargetTL",
DROP COLUMN "minCampaignTargetKg",
DROP COLUMN "minCampaignTargetPackages",
DROP COLUMN "minCampaignTargetTL";

-- DropTable
DROP TABLE "StoreProduct";

-- DropEnum
DROP TYPE "CampaignTargetUnit";

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "targetStock" INTEGER NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "storeOrderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "trackingUrl" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignProduct_campaignId_idx" ON "CampaignProduct"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignProduct_campaignId_productId_key" ON "CampaignProduct"("campaignId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_storeOrderId_key" ON "Shipment"("storeOrderId");

-- CreateIndex
CREATE INDEX "Shipment_storeOrderId_idx" ON "Shipment"("storeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_showInStore_isActive_idx" ON "Product"("showInStore", "isActive");

-- CreateIndex
CREATE INDEX "Product_showInDonation_idx" ON "Product"("showInDonation");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_isActive_isFeatured_idx" ON "Product"("isActive", "isFeatured");

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_storeOrderId_fkey" FOREIGN KEY ("storeOrderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
