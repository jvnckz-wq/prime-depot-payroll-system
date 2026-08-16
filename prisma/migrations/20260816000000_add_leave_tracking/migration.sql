-- Leave tracking.
-- Each employee gets an annual paid-leave allotment (default 5, the Service
-- Incentive Leave minimum). A day taken as leave is marked on the attendance
-- record; it is paid like a present day but counted separately.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "leaveCredits" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN "isLeave" BOOLEAN NOT NULL DEFAULT false;
