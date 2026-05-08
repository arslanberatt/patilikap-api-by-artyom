/*
  Warnings:

  - The values [REFUND] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[cancelToken]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[trackingToken]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cancelToken]` on the table `StoreOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[trackingToken]` on the table `StoreOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storyId,viewerKey]` on the table `StoryView` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `viewerKey` to the `StoryView` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('WAITING_APPROVAL', 'PAID', 'CANCELLED', 'REFUNDED');
ALTER TABLE "public"."Order" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "public"."StoreOrder" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new" USING ("paymentStatus"::text::"PaymentStatus_new");
ALTER TABLE "StoreOrder" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new" USING ("paymentStatus"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" SET DEFAULT 'WAITING_APPROVAL';
ALTER TABLE "StoreOrder" ALTER COLUMN "paymentStatus" SET DEFAULT 'WAITING_APPROVAL';
COMMIT;

-- DropIndex
DROP INDEX "StoryView_storyId_userId_key";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "cancelToken" TEXT,
ADD COLUMN     "cancelTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "guestAddress" TEXT,
ADD COLUMN     "guestCity" TEXT,
ADD COLUMN     "paytxMerchantOid" TEXT,
ADD COLUMN     "receiptUrl" TEXT,
ADD COLUMN     "trackingToken" TEXT;

-- AlterTable
ALTER TABLE "StoreOrder" ADD COLUMN     "cancelRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "cancelToken" TEXT,
ADD COLUMN     "cancelTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "trackingToken" TEXT;

-- AlterTable
ALTER TABLE "StoryView" ADD COLUMN     "viewerKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_cancelToken_key" ON "Order"("cancelToken");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "StoreOrder_cancelToken_key" ON "StoreOrder"("cancelToken");

-- CreateIndex
CREATE UNIQUE INDEX "StoreOrder_trackingToken_key" ON "StoreOrder"("trackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_storyId_viewerKey_key" ON "StoryView"("storyId", "viewerKey");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
