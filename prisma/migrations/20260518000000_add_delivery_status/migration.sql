-- Bağış siparişlerine teslim akışı ekle.
-- Üç paydaş (admin/barınak/kullanıcı) görür; admin durum değiştirir, barınak teslim aldığını teyit eder.

CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_SHIPPED', 'PREPARING', 'SHIPPED', 'DELIVERED');

ALTER TABLE "Order"
  ADD COLUMN "deliveryStatus"     "DeliveryStatus" NOT NULL DEFAULT 'NOT_SHIPPED',
  ADD COLUMN "deliveryNote"       TEXT,
  ADD COLUMN "deliveredAt"        TIMESTAMP(3),
  ADD COLUMN "shelterConfirmedAt" TIMESTAMP(3);

CREATE INDEX "Order_deliveryStatus_createdAt_idx" ON "Order"("deliveryStatus", "createdAt");
