-- Barınağa kod ile doğrudan gönderim için StoreOrder'a shelterId eklendi.
-- Kampanyasız sipariş, barınak adresine teslim. Barınak silinirse FK SET NULL.

ALTER TABLE "StoreOrder" ADD COLUMN "shelterId" TEXT;

CREATE INDEX "StoreOrder_shelterId_idx" ON "StoreOrder"("shelterId");

ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_shelterId_fkey" FOREIGN KEY ("shelterId") REFERENCES "Shelter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
