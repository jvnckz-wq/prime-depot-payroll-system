-- Loans & Advances, Phase 3 (Sep 2026)
-- Additive. Before running: the check in GAME-PLAN v19 must return 0 rows
-- (no loan with two entries for the same run), or the unique index fails.

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "companyCover" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "loan_entries_loanId_payslipId_key" ON "loan_entries"("loanId", "payslipId");
