-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedMessage_messageId_key" ON "ProcessedMessage"("messageId");

-- CreateIndex
CREATE INDEX "ProcessedMessage_messageId_idx" ON "ProcessedMessage"("messageId");

-- CreateIndex
CREATE INDEX "ProcessedMessage_threadId_idx" ON "ProcessedMessage"("threadId");

-- CreateIndex
CREATE INDEX "ProcessedMessage_type_idx" ON "ProcessedMessage"("type");
