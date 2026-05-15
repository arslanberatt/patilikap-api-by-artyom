-- AlterTable: Add slug, charterDocUrl, activityDocUrl to Shelter
ALTER TABLE "Shelter" ADD COLUMN "slug" TEXT;
ALTER TABLE "Shelter" ADD COLUMN "charterDocUrl" TEXT;
ALTER TABLE "Shelter" ADD COLUMN "activityDocUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shelter_slug_key" ON "Shelter"("slug");
