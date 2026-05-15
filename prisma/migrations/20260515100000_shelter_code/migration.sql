-- AlterTable: Add code column to Shelter (IF NOT EXISTS to be safe)
ALTER TABLE "Shelter" ADD COLUMN IF NOT EXISTS "code" TEXT;

-- CreateIndex (IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "Shelter_code_key" ON "Shelter"("code");
