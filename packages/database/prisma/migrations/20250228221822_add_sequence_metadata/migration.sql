/*
  Warnings:

  - A unique constraint covering the columns `[userId,email]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Contact_email_key";

-- AlterTable
ALTER TABLE "Sequence" ADD COLUMN     "metadata" JSONB DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_email_key" ON "Contact"("userId", "email");
