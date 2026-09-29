-- Loans & Advances, Phase 2 (Sep 2026)
-- All additive with defaults: code from before this migration keeps working.

-- CreateEnum
CREATE TYPE "LoanPurpose" AS ENUM ('HOSPITALIZATION', 'EMERGENCY', 'OTHER');

-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "purpose" "LoanPurpose";

-- AlterTable
ALTER TABLE "loan_entries" ADD COLUMN     "shortfall" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "advanceDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill: a loan's purpose used to be stored in "note". Copy it into the new
-- column. Old labels that are no longer offered become OTHER; the original text
-- stays in "note" and is still shown. Cash advances have no purpose.
UPDATE "loans"
SET "purpose" = CASE "note"
    WHEN 'Hospitalization' THEN 'HOSPITALIZATION'::"LoanPurpose"
    WHEN 'Emergency' THEN 'EMERGENCY'::"LoanPurpose"
    ELSE 'OTHER'::"LoanPurpose"
  END
WHERE "type" = 'LOAN' AND "purpose" IS NULL;
