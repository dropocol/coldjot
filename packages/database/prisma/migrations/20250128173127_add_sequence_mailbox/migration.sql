-- AlterTable
ALTER TABLE "_EmailListContacts" ADD CONSTRAINT "_EmailListContacts_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_EmailListContacts_AB_unique";

-- CreateTable
CREATE TABLE "SequenceMailbox" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "aliasId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SequenceMailbox_sequenceId_key" ON "SequenceMailbox"("sequenceId");

-- CreateIndex
CREATE INDEX "SequenceMailbox_sequenceId_idx" ON "SequenceMailbox"("sequenceId");

-- CreateIndex
CREATE INDEX "SequenceMailbox_mailboxId_idx" ON "SequenceMailbox"("mailboxId");

-- CreateIndex
CREATE INDEX "SequenceMailbox_aliasId_idx" ON "SequenceMailbox"("aliasId");

-- AddForeignKey
ALTER TABLE "SequenceMailbox" ADD CONSTRAINT "SequenceMailbox_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceMailbox" ADD CONSTRAINT "SequenceMailbox_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceMailbox" ADD CONSTRAINT "SequenceMailbox_aliasId_fkey" FOREIGN KEY ("aliasId") REFERENCES "EmailAlias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
