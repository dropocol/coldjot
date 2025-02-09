/*
  Warnings:

  - You are about to drop the `EmailWatchNotificationHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EmailWatchNotificationHistory" DROP CONSTRAINT "EmailWatchNotificationHistory_emailWatchId_fkey";

-- DropTable
DROP TABLE "EmailWatchNotificationHistory";

-- CreateTable
CREATE TABLE "EmailWatchHistory" (
    "id" TEXT NOT NULL,
    "emailWatchId" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailWatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailWatchHistory_emailWatchId_idx" ON "EmailWatchHistory"("emailWatchId");

-- CreateIndex
CREATE INDEX "EmailWatchHistory_processed_idx" ON "EmailWatchHistory"("processed");

-- AddForeignKey
ALTER TABLE "EmailWatchHistory" ADD CONSTRAINT "EmailWatchHistory_emailWatchId_fkey" FOREIGN KEY ("emailWatchId") REFERENCES "EmailWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
