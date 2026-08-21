-- Security hardening: durable login throttle, audit trail, and crew pay rates.
--
-- Three unrelated-looking tables land together because they came out of one
-- security review:
--
--   login_attempts  the login throttle used to live in a process-local Map, so
--                   it reset on every cold start and every serverless instance
--                   kept its own tally. In the database it is shared and durable.
--
--   audit_logs      nothing recorded who signed in, who reset whose password,
--                   or who released a cutoff. For a system that moves salaries
--                   — and under RA 10173 — that trail has to exist.
--
--   crew_rates      the pakyawan daily minimums and the palima bonus were
--                   hardcoded constants in the client bundle. Money belongs in
--                   the database, next to the per-item rates that already do.

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGIN_THROTTLED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'ACCOUNT_CREATED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED', 'SESSIONS_REVOKED', 'PAYROLL_FINALIZED', 'PAYROLL_UNFINALIZED', 'DELIVERY_VOIDED', 'DELIVERY_UNVOIDED', 'CREW_RATES_UPDATED');

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_rates" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "driverDaily" DECIMAL(12,2) NOT NULL DEFAULT 280,
    "helperDaily" DECIMAL(12,2) NOT NULL DEFAULT 240,
    "bonusHead" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "bonusTrips" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crew_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_attempts_key_key" ON "login_attempts"("key");

-- CreateIndex
CREATE INDEX "login_attempts_firstAt_idx" ON "login_attempts"("firstAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the single crew rate row with the values that were previously hardcoded
-- in src/data/seed.js, so behaviour is identical the moment this deploys.
INSERT INTO "crew_rates" ("id", "driverDaily", "helperDaily", "bonusHead", "bonusTrips", "updatedAt")
VALUES ('current', 280, 240, 100, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
