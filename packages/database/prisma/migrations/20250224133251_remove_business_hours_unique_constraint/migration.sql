-- DropIndex
DROP INDEX "BusinessHours_userId_type_key";

-- CreateIndex
CREATE INDEX "BusinessHours_type_idx" ON "BusinessHours"("type");
