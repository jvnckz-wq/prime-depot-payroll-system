-- Account-settings 2FA management (Sep 2026)
--
-- Adds two AuditAction values used by the new backup-code regeneration and
-- authenticator re-enrollment endpoints. Everything else in this batch needs no
-- schema change (the 2FA columns already exist).
--
-- Run these on Neon BEFORE deploying the batch, then `npx prisma generate` and
-- restart the dev server. ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block, so run each statement on its own (Neon's SQL editor does).

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BACKUP_CODES_REGENERATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_REENROLLED';
