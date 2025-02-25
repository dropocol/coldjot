-- CreateTable
CREATE TABLE "email_watch" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "history_id" TEXT NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_history" (
    "id" TEXT NOT NULL,
    "email_watch_id" TEXT NOT NULL,
    "history_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_watch_email_key" ON "email_watch"("email");

-- CreateIndex
CREATE INDEX "email_watch_user_id_idx" ON "email_watch"("user_id");

-- CreateIndex
CREATE INDEX "notification_history_email_watch_id_idx" ON "notification_history"("email_watch_id");

-- CreateIndex
CREATE INDEX "notification_history_processed_idx" ON "notification_history"("processed");

-- AddForeignKey
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_email_watch_id_fkey" FOREIGN KEY ("email_watch_id") REFERENCES "email_watch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
