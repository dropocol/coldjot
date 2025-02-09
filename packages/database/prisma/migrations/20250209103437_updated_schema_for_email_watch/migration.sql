/*
  Warnings:

  - You are about to drop the `email_watch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_history` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "notification_history" DROP CONSTRAINT "notification_history_email_watch_id_fkey";

-- DropTable
DROP TABLE "email_watch";

-- DropTable
DROP TABLE "notification_history";

-- CreateTable
CREATE TABLE "EmailWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationHistory" (
    "id" TEXT NOT NULL,
    "emailWatchId" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailWatch_email_key" ON "EmailWatch"("email");

-- CreateIndex
CREATE INDEX "EmailWatch_userId_idx" ON "EmailWatch"("userId");

-- CreateIndex
CREATE INDEX "NotificationHistory_emailWatchId_idx" ON "NotificationHistory"("emailWatchId");

-- CreateIndex
CREATE INDEX "NotificationHistory_processed_idx" ON "NotificationHistory"("processed");

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_emailWatchId_fkey" FOREIGN KEY ("emailWatchId") REFERENCES "EmailWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
