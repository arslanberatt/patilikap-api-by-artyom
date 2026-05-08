-- AlterEnum
ALTER TYPE "ShelterStatus" ADD VALUE 'INACTIVE';

-- DropIndex
DROP INDEX "Shelter_userId_key";
