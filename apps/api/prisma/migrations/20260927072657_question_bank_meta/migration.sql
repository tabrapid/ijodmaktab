-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "category" "Category" NOT NULL DEFAULT 'KNOWLEDGE',
ADD COLUMN     "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "schoolApprovedAt" TIMESTAMP(3),
ADD COLUMN     "schoolApprovedById" UUID,
ADD COLUMN     "schoolRequestedAt" TIMESTAMP(3),
ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE';

-- CreateIndex
CREATE INDEX "Question_visibility_idx" ON "Question"("visibility");
