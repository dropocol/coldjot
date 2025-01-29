/*
  Warnings:

  - You are about to drop the column `mailboxId` on the `Sequence` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Sequence" DROP CONSTRAINT "Sequence_mailboxId_fkey";

-- AlterTable
ALTER TABLE "Sequence" DROP COLUMN "mailboxId";
