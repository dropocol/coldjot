/*
  Warnings:

  - You are about to drop the `TestData` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TestData" DROP CONSTRAINT "TestData_userId_fkey";

-- DropTable
DROP TABLE "TestData";
