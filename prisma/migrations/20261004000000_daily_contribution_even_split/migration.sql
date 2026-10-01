-- AlterTable
ALTER TABLE "crew_rates" ALTER COLUMN "dailyContribution" DROP NOT NULL,
ALTER COLUMN "dailyContribution" DROP DEFAULT;

-- UpdateData
UPDATE "crew_rates" SET "dailyContribution" = NULL;
