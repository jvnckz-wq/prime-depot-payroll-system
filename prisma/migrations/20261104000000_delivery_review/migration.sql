-- Delivery review (safe to run more than once, like the other recent migrations: the database
-- may already have some of this from SQL run directly on Neon).

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELIVERY_CONFIRMED';

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_reviewedById_fkey') THEN
    ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Data: SSS, PhilHealth and Pag-IBIG are mandatory for every position that has contributions
-- (daily-paid crew and Job Order have none), so older records are brought in line.
-- Helper is stored as PAHINANTE (see @map on the Position enum).
UPDATE "employees"
SET "sssEnrolled" = true, "philhealthEnrolled" = true, "pagibigEnrolled" = true
WHERE "position" NOT IN ('DRIVER', 'PAHINANTE', 'CHECKER', 'WAREHOUSE_OFFICER', 'JOB_ORDER');
