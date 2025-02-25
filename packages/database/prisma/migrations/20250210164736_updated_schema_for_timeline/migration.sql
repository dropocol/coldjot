-- AlterTable
ALTER TABLE "EmailTracking" ADD COLUMN     "previewText" TEXT,
ADD COLUMN     "subject" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "SequenceStep" ALTER COLUMN "subject" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Template" ALTER COLUMN "content" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "EmailTracking_contactId_idx" ON "EmailTracking"("contactId");

-- CreateIndex
CREATE INDEX "EmailTracking_templateId_idx" ON "EmailTracking"("templateId");

-- AddForeignKey
ALTER TABLE "EmailTracking" ADD CONSTRAINT "EmailTracking_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTracking" ADD CONSTRAINT "EmailTracking_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTracking" ADD CONSTRAINT "EmailTracking_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
