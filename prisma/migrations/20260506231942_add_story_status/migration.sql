-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ShelterStory" ADD COLUMN     "status" "StoryStatus" NOT NULL DEFAULT 'PENDING';
