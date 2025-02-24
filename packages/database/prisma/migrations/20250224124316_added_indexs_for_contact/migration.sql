-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_firstName_idx" ON "Contact"("firstName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_lastName_idx" ON "Contact"("lastName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_name_idx" ON "Contact"("name");
