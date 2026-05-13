-- AlterTable: add sizes, colors, materials arrays to Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sizes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "colors" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "materials" TEXT[] NOT NULL DEFAULT '{}';
