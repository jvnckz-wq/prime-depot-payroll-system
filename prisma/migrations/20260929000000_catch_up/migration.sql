-- Catch-up migration (Sep 29, 2026).
--
-- Records every schema change made between 20260830100000_add_password_reset
-- and the current schema.prisma: two-factor login (users, sessions, audit
-- actions), verified recovery email codes (password_resets.purpose), the
-- delivery address fields, the double-rate audit action, and the live
-- biometric sync tables (device_sync, pull_requests).
--
-- These changes were first applied to the production database (Neon) by hand.
-- There, this migration is marked as applied with
--   npx prisma migrate resolve --applied 20260929000000_catch_up
-- and is never executed. On a fresh database, `prisma migrate deploy` runs it
-- after the earlier migrations, so the full schema can be rebuilt from the repo.
--
-- Generated with: prisma migrate diff --from-schema <schema at 8c52155>
--                 --to-schema prisma/schema.prisma --script
-- Verified: Neon vs schema.prisma drift check reported no difference.

-- CreateEnum
CREATE TYPE "CodePurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY');

-- CreateEnum
CREATE TYPE "PullStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_2FA_PENDING';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_2FA_FAILURE';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'RECOVERY_EMAIL_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'BACKUP_CODES_REGENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_REENROLLED';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_DOUBLE_CHANGED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;

-- AlterTable
ALTER TABLE "password_resets" ADD COLUMN     "purpose" "CodePurpose" NOT NULL DEFAULT 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "pendingTwoFactor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "barangay" TEXT,
ADD COLUMN     "municipality" TEXT,
ADD COLUMN     "province" TEXT DEFAULT 'Batangas';

-- CreateTable
CREATE TABLE "device_sync" (
    "id" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "lastScanAt" TIMESTAMP(3),
    "matched" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pull_requests" (
    "id" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PullStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "matched" INTEGER NOT NULL DEFAULT 0,
    "mappedRows" INTEGER NOT NULL DEFAULT 0,
    "unmappedUsers" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);
