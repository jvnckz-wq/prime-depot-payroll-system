-- Two-factor authentication migration.
-- Run this once on Neon (SQL editor), then locally: npx prisma generate, then
-- restart the dev server. All columns have safe defaults, so existing rows are
-- untouched and existing sessions keep working. Every statement is safe to
-- re-run, so running the whole file again after an earlier version is fine.

ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "totpSecret"       TEXT;
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "totpEnabled"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "backupCodes"      TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "pendingTwoFactor" BOOLEAN NOT NULL DEFAULT false;

-- Security review follow-up (Sep 2026).
-- Wrong-code cap per pending 2FA session.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0;
-- Last accepted TOTP time step, so a code cannot be replayed.
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "totpLastStep"      INTEGER;

-- Separate password-reset codes from recovery-email confirmation codes.
DO $$ BEGIN
  CREATE TYPE "CodePurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "purpose" "CodePurpose" NOT NULL DEFAULT 'PASSWORD_RESET';

-- New audit events.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_2FA_PENDING';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_2FA_FAILURE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECOVERY_EMAIL_CHANGED';
