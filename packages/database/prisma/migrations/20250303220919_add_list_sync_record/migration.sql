-- CreateTable
CREATE TABLE "ListSyncRecord" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "contactsAdded" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListSyncRecord_listId_idx" ON "ListSyncRecord"("listId");

-- CreateIndex
CREATE INDEX "ListSyncRecord_sequenceId_idx" ON "ListSyncRecord"("sequenceId");

-- CreateIndex
CREATE INDEX "ListSyncRecord_status_idx" ON "ListSyncRecord"("status");

-- CreateIndex
CREATE INDEX "ListSyncRecord_createdAt_idx" ON "ListSyncRecord"("createdAt");

-- AddForeignKey
ALTER TABLE "ListSyncRecord" ADD CONSTRAINT "ListSyncRecord_listId_fkey" FOREIGN KEY ("listId") REFERENCES "EmailList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListSyncRecord" ADD CONSTRAINT "ListSyncRecord_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
