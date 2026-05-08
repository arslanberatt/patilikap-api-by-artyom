-- DropIndex
DROP INDEX "Product_categoryId_idx";

-- DropIndex
DROP INDEX "Product_showInStore_isActive_idx";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productionDate" TIMESTAMP(3),
ALTER COLUMN "stock" SET DEFAULT 9999;

-- AlterTable
ALTER TABLE "StoreOrder" ADD COLUMN     "guestAddress" TEXT,
ADD COLUMN     "guestCity" TEXT,
ADD COLUMN     "receiptUrl" TEXT;

-- AlterTable
ALTER TABLE "StoreOrderItem" ADD COLUMN     "weightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "freeShipping" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CargoRate" (
    "id" TEXT NOT NULL,
    "minKg" DOUBLE PRECISION NOT NULL,
    "maxKg" DOUBLE PRECISION,
    "price" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CargoRate_minKg_isActive_idx" ON "CargoRate"("minKg", "isActive");

-- CreateIndex
CREATE INDEX "Product_showInStore_isActive_sortOrder_idx" ON "Product"("showInStore", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_showInStore_isActive_price_idx" ON "Product"("showInStore", "isActive", "price");

-- CreateIndex
CREATE INDEX "Product_showInStore_isActive_createdAt_idx" ON "Product"("showInStore", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "Product_showInStore_isActive_name_idx" ON "Product"("showInStore", "isActive", "name");

-- CreateIndex
CREATE INDEX "Product_categoryId_showInStore_isActive_idx" ON "Product"("categoryId", "showInStore", "isActive");

-- CreateIndex
CREATE INDEX "Product_brand_showInStore_idx" ON "Product"("brand", "showInStore");
