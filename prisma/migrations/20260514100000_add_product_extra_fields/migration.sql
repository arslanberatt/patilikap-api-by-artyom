-- Add missing product fields (productionDate, expiryDate, brand, tags, nutritionValues, weightKg)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productionDate" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "nutritionValues" JSONB;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weightKg" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';

-- Index for brand filtering (may already exist, skip if so)
CREATE INDEX IF NOT EXISTS "Product_brand_showInStore_idx" ON "Product"("brand", "showInStore");
