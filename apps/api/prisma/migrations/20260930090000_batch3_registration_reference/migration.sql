-- CreateEnum
CREATE TYPE "RegistrationSource" AS ENUM ('ADMIN', 'IMPORT', 'SELF');

-- CreateEnum
CREATE TYPE "AcademicDegree" AS ENUM ('NONE', 'CANDIDATE', 'PHD', 'DSC');

-- CreateEnum
CREATE TYPE "TeacherCategory" AS ENUM ('NONE', 'SPECIALIST', 'SECOND', 'FIRST', 'HIGHEST');

-- CreateEnum
CREATE TYPE "TeacherCredentialKind" AS ENUM ('SPECIALTY_NATIONAL', 'SPECIALTY_INTERNATIONAL', 'OTHER_NATIONAL', 'OTHER_INTERNATIONAL', 'PROFESSIONAL_DEVELOPMENT', 'CONTEST');

-- CreateEnum
CREATE TYPE "MentorshipKind" AS ENUM ('NATIONAL', 'INTERNATIONAL');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "studentRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "teacherRegistrationOpen" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "pinflEncrypted" TEXT,
ADD COLUMN     "pinflHash" TEXT,
ADD COLUMN     "registrationSource" "RegistrationSource" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "specialtySubjectId" UUID;

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "userId" UUID NOT NULL,
    "university" TEXT,
    "graduationYear" INTEGER,
    "academicDegree" "AcademicDegree" NOT NULL DEFAULT 'NONE',
    "degreeFileId" UUID,
    "category" "TeacherCategory" NOT NULL DEFAULT 'NONE',
    "categoryAwardedOn" DATE,
    "categoryFileId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TeacherCredential" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "kind" "TeacherCredentialKind" NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" UUID,
    "provider" TEXT,
    "level" TEXT,
    "score" DECIMAL(7,2),
    "certificateNumber" TEXT,
    "issuedOn" DATE,
    "validUntil" DATE,
    "details" JSONB,
    "fileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherMentorship" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "portfolioItemId" UUID NOT NULL,
    "kind" "MentorshipKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherMentorship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_degreeFileId_key" ON "TeacherProfile"("degreeFileId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_categoryFileId_key" ON "TeacherProfile"("categoryFileId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherCredential_fileId_key" ON "TeacherCredential"("fileId");

-- CreateIndex
CREATE INDEX "TeacherCredential_teacherId_kind_idx" ON "TeacherCredential"("teacherId", "kind");

-- CreateIndex
CREATE INDEX "TeacherMentorship_portfolioItemId_idx" ON "TeacherMentorship"("portfolioItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherMentorship_teacherId_portfolioItemId_key" ON "TeacherMentorship"("teacherId", "portfolioItemId");

-- CreateIndex
CREATE UNIQUE INDEX "User_pinflHash_key" ON "User"("pinflHash");

-- CreateIndex
CREATE INDEX "User_registrationSource_createdAt_idx" ON "User"("registrationSource", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_specialtySubjectId_fkey" FOREIGN KEY ("specialtySubjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_degreeFileId_fkey" FOREIGN KEY ("degreeFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_categoryFileId_fkey" FOREIGN KEY ("categoryFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCredential" ADD CONSTRAINT "TeacherCredential_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCredential" ADD CONSTRAINT "TeacherCredential_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCredential" ADD CONSTRAINT "TeacherCredential_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherMentorship" ADD CONSTRAINT "TeacherMentorship_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherMentorship" ADD CONSTRAINT "TeacherMentorship_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

