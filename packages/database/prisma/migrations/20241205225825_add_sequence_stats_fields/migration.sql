-- AlterTable
ALTER TABLE "SequenceStats" ADD COLUMN     "interested" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "peopleContacted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "uniqueOpens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unsubscribed" INTEGER NOT NULL DEFAULT 0;