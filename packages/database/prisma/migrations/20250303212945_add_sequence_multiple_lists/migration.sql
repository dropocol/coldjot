/*
  Warnings:

  - You are about to drop the column `emailListId` on the `Sequence` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Sequence" DROP CONSTRAINT "Sequence_emailListId_fkey";

-- AlterTable
ALTER TABLE "Sequence" DROP COLUMN "emailListId";

-- CreateTable
CREATE TABLE "_SequenceToLists" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SequenceToLists_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_SequenceToLists_B_index" ON "_SequenceToLists"("B");

-- AddForeignKey
ALTER TABLE "_SequenceToLists" ADD CONSTRAINT "_SequenceToLists_A_fkey" FOREIGN KEY ("A") REFERENCES "EmailList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SequenceToLists" ADD CONSTRAINT "_SequenceToLists_B_fkey" FOREIGN KEY ("B") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
