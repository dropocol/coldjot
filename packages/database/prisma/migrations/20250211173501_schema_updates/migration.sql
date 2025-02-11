/*
  Warnings:

  - You are about to drop the column `previewText` on the `EmailTracking` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "EmailTracking_templateId_idx";

-- AlterTable
ALTER TABLE "EmailTracking" DROP COLUMN "previewText";
