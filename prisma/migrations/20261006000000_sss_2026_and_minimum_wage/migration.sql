BEGIN;

-- UpdateData
DELETE FROM "sss_brackets" WHERE "effectiveYear" = (SELECT MAX("effectiveYear") FROM "philhealth_config");
INSERT INTO "sss_brackets" ("id", "effectiveYear", "salaryFrom", "salaryTo", "employeeShare", "employerShare")
SELECT gen_random_uuid()::text, y.yr,
       CASE WHEN msc = 5000 THEN 0 ELSE msc - 250 END,
       CASE WHEN msc = 35000 THEN 999999999 ELSE msc + 250 END,
       msc * 0.05,
       0
FROM (SELECT MAX("effectiveYear") AS yr FROM "philhealth_config") AS y
CROSS JOIN generate_series(5000, 35000, 500) AS msc
WHERE y.yr IS NOT NULL;

-- AlterTable
ALTER TABLE "crew_rates" ADD COLUMN     "minimumDailyWage" DECIMAL(12,2);

COMMIT;
