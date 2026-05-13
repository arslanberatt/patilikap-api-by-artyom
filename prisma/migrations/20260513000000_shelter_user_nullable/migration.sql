-- DropForeignKey
ALTER TABLE "Shelter" DROP CONSTRAINT "Shelter_userId_fkey";

-- AlterTable
ALTER TABLE "Shelter" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Shelter" ADD CONSTRAINT "Shelter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
