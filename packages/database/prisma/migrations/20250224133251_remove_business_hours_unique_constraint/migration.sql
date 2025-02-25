-- DropIndex
DROP INDEX IF EXISTS "BusinessHours_userId_type_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessHours_type_idx" ON "BusinessHours"("type");
