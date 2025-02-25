/*
  Warnings:

  - You are about to drop the column `defaultAliasId` on the `Mailbox` table. All the data in the column will be lost.
  - You are about to drop the column `isDefault` on the `Mailbox` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Mailbox" DROP CONSTRAINT "Mailbox_defaultAliasId_fkey";

-- DropIndex
DROP INDEX "Mailbox_defaultAliasId_idx";

-- AlterTable
ALTER TABLE "Mailbox" DROP COLUMN "defaultAliasId",
DROP COLUMN "isDefault";
