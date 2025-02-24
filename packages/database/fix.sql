-- DropIndex
DROP INDEX "Contact_email_key";

-- CreateIndex
CREATE INDEX "BusinessHours_type_idx" ON "BusinessHours"("type");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_firstName_idx" ON "Contact"("firstName");

-- CreateIndex
CREATE INDEX "Contact_lastName_idx" ON "Contact"("lastName");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_email_key" ON "Contact"("userId", "email");

