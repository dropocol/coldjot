/*
  Warnings:

  - You are about to drop the `NotificationHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "NotificationHistory" DROP CONSTRAINT "NotificationHistory_emailWatchId_fkey";

-- DropTable
DROP TABLE "NotificationHistory";

-- CreateTable
CREATE TABLE "EmailWatchNotificationHistory" (
    "id" TEXT NOT NULL,
    "emailWatchId" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailWatchNotificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailWatchNotificationHistory_emailWatchId_idx" ON "EmailWatchNotificationHistory"("emailWatchId");

-- CreateIndex
CREATE INDEX "EmailWatchNotificationHistory_processed_idx" ON "EmailWatchNotificationHistory"("processed");

-- AddForeignKey
ALTER TABLE "EmailWatchNotificationHistory" ADD CONSTRAINT "EmailWatchNotificationHistory_emailWatchId_fkey" FOREIGN KEY ("emailWatchId") REFERENCES "EmailWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
