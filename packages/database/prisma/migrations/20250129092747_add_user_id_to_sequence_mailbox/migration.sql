-- AlterTable
ALTER TABLE "SequenceMailbox" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "SequenceMailbox_userId_idx" ON "SequenceMailbox"("userId");

-- AddForeignKey
ALTER TABLE "SequenceMailbox" ADD CONSTRAINT "SequenceMailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
