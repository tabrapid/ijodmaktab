-- CreateEnum
CREATE TYPE "TestVisibility" AS ENUM ('PRIVATE', 'SCHOOL');

-- CreateEnum
CREATE TYPE "AttemptLockReason" AS ENUM ('FULLSCREEN_EXIT', 'PAGE_HIDDEN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PortfolioItemType" ADD VALUE 'NATIONAL_CERTIFICATE';
ALTER TYPE "PortfolioItemType" ADD VALUE 'CEFR';
ALTER TYPE "PortfolioItemType" ADD VALUE 'IELTS';
ALTER TYPE "PortfolioItemType" ADD VALUE 'SAT';

-- AlterTable
ALTER TABLE "AssessmentSession" ADD COLUMN     "requireFullscreen" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "lockCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockReason" "AttemptLockReason",
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "unlockedAt" TIMESTAMP(3),
ADD COLUMN     "unlockedById" UUID;

-- AlterTable
ALTER TABLE "PortfolioItem" ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "TestTemplate" ADD COLUMN     "schoolSharedAt" TIMESTAMP(3),
ADD COLUMN     "visibility" "TestVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarFileId" UUID;

-- CreateIndex
CREATE INDEX "TestTemplate_visibility_status_idx" ON "TestTemplate"("visibility", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarFileId_key" ON "User"("avatarFileId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

