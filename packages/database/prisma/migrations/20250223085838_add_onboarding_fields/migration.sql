-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingData" JSONB,
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0;
