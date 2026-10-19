-- Effective-dated early-shift schedules (safe to run more than once).
CREATE TABLE IF NOT EXISTS "employee_shift_schedules" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "days" "Weekday"[] DEFAULT ARRAY[]::"Weekday"[],
    "time" TEXT NOT NULL DEFAULT '06:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_shift_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_shift_schedules_employeeId_effectiveFrom_key"
    ON "employee_shift_schedules"("employeeId", "effectiveFrom");

DO $$ BEGIN
    ALTER TABLE "employee_shift_schedules" ADD CONSTRAINT "employee_shift_schedules_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Operations Head and crew never have an early shift.
UPDATE "employees" SET "earlyShiftDays" = ARRAY[]::"Weekday"[]
WHERE "position" IN ('OPERATIONS_HEAD', 'DRIVER', 'PAHINANTE', 'CHECKER', 'WAREHOUSE_OFFICER', 'JOB_ORDER');

-- Starting point: everyone's current schedule, covering all earlier days.
INSERT INTO "employee_shift_schedules" ("id", "employeeId", "effectiveFrom", "days", "time")
SELECT 'ess_' || "id", "id", DATE '2000-01-01', "earlyShiftDays", COALESCE("earlyShiftTime", '06:00')
FROM "employees"
ON CONFLICT ("employeeId", "effectiveFrom") DO NOTHING;
