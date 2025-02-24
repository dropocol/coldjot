/*
  Warnings:

  - A unique constraint covering the columns `[userId,type]` on the table `BusinessHours` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,email]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Contact_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHours_userId_type_key" ON "BusinessHours"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_email_key" ON "Contact"("userId", "email");
