-- Add raw Gemini payload storage and summary linkage for quizzes
ALTER TABLE "Summary"
  ADD COLUMN "rawResponse" JSONB,
  ADD COLUMN "model" TEXT NOT NULL DEFAULT 'gemini-flash-latest',
  ADD COLUMN "inputFiles" JSONB;

UPDATE "Summary" SET "model" = 'gemini-flash-latest';

ALTER TABLE "Summary"
  ALTER COLUMN "model" DROP DEFAULT;

ALTER TABLE "Quiz"
  ADD COLUMN "rawResponse" JSONB,
  ADD COLUMN "model" TEXT NOT NULL DEFAULT 'gemini-flash-latest',
  ADD COLUMN "inputFiles" JSONB,
  ADD COLUMN "summaryId" TEXT;

UPDATE "Quiz" SET "model" = 'gemini-flash-latest';

ALTER TABLE "Quiz"
  ALTER COLUMN "model" DROP DEFAULT;

ALTER TABLE "Quiz"
  ADD CONSTRAINT "Quiz_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "Summary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
