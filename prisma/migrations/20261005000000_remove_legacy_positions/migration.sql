BEGIN;

-- UpdateData
UPDATE "employees" SET "position" = 'ADMINISTRATIVE_ASSISTANT' WHERE "id" = '3' AND "position" = 'ADMINISTRATIVE_STAFF';
UPDATE "employees" SET "position" = 'COLLECTION_OFFICER' WHERE "id" = '5' AND "position" = 'TRAINEE';
UPDATE "employees" SET "position" = 'JUNIOR_SECRETARY' WHERE "id" = '15' AND "position" = 'TRAINEE';
UPDATE "employees" SET "position" = 'COMMUNICATIONS_OFFICER_I' WHERE "id" = '4' AND "position" = 'ADMINISTRATIVE_STAFF';
UPDATE "employees" SET "position" = 'ADMINISTRATIVE_ASSISTANT' WHERE "id" = '67' AND "position" = 'ADMINISTRATIVE_STAFF';
UPDATE "employees" SET "position" = 'ADMINISTRATIVE_ASSISTANT' WHERE "position" IN ('ADMINISTRATIVE_STAFF', 'SECRETARY_SPECIAL_SHIFT', 'TRAINEE');

-- AlterEnum
CREATE TYPE "Position_new" AS ENUM ('OPERATIONS_HEAD', 'CHECKER', 'DRIVER', 'PAHINANTE', 'ADMINISTRATIVE_ASSISTANT', 'COMMUNICATIONS_OFFICER_II', 'JUNIOR_SECRETARY', 'JOB_ORDER', 'COMMUNICATIONS_OFFICER_I', 'COLLECTION_OFFICER', 'WAREHOUSE_OFFICER');
ALTER TABLE "employees" ALTER COLUMN "position" TYPE "Position_new" USING ("position"::text::"Position_new");
ALTER TYPE "Position" RENAME TO "Position_old";
ALTER TYPE "Position_new" RENAME TO "Position";
DROP TYPE "Position_old";

COMMIT;
