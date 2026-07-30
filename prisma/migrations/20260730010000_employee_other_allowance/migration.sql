-- AlterTable
-- Per-employee default "Other Allowances" for staff payroll. Existing rows get
-- 0.00 (the previously hardcoded ₱4,400 was wrong for everyone but one person),
-- so the admin sets each employee's real allowance after this deploys.
ALTER TABLE "employees" ADD COLUMN "otherAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0;
