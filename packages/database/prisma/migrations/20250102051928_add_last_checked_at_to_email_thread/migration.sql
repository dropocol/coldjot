-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;