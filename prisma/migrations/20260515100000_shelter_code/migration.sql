-- AlterTable: Add code column to Shelter
ALTER TABLE "Shelter" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shelter_code_key" ON "Shelter"("code");
