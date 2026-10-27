-- Prime Depot: let live sync keep scans of unregistered biometric IDs.
-- Run this on Neon BEFORE extracting the ZIP, then: npx prisma generate, then restart the dev server.
ALTER TABLE "unmapped_logs" ALTER COLUMN "importBatchId" DROP NOT NULL;
