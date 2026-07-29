-- AlterEnum
-- Adds the office-staff positions from the client's real payroll sheet.
-- Additive only: existing employee rows keep their current position value, and
-- none of these are crew, so no crew-vs-staff logic is affected.
ALTER TYPE "Position" ADD VALUE 'ADMINISTRATIVE_ASSISTANT';
ALTER TYPE "Position" ADD VALUE 'COMMUNICATIONS_OFFICER_II';
ALTER TYPE "Position" ADD VALUE 'JUNIOR_SECRETARY';
ALTER TYPE "Position" ADD VALUE 'JOB_ORDER';
ALTER TYPE "Position" ADD VALUE 'TRAINEE';
