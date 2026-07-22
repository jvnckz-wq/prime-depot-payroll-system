-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CHECKER');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('OPERATIONS_HEAD', 'ADMINISTRATIVE_STAFF', 'SECRETARY_SPECIAL_SHIFT', 'CHECKER', 'DRIVER', 'PAHINANTE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('LOAN', 'CASH_ADVANCE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('GRANT', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayrollType" AS ENUM ('STAFF', 'TRUCK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CHECKER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "dailyRate" DECIMAL(12,2) NOT NULL,
    "declaredSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "sssEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "philhealthEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "pagibigEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "mp2Amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "address" TEXT,
    "contactNumber" TEXT,
    "birthdate" DATE,
    "dateHired" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "tardinessMins" INTEGER NOT NULL DEFAULT 0,
    "overtimeMins" INTEGER NOT NULL DEFAULT 0,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "isAssumedIn" BOOLEAN NOT NULL DEFAULT false,
    "isAssumedOut" BOOLEAN NOT NULL DEFAULT false,
    "isManualEdit" BOOLEAN NOT NULL DEFAULT false,
    "editNote" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" DATE,
    "periodEnd" DATE,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "mappedRows" INTEGER NOT NULL DEFAULT 0,
    "unmappedRows" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unmapped_logs" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "biometricId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "unmapped_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trucks" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "usualDriverId" TEXT,
    "usualHelper1" TEXT,
    "usualHelper2" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "truckId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "helper1Id" TEXT,
    "helper2Id" TEXT,
    "sequenceNo" INTEGER NOT NULL,
    "customerName" TEXT,
    "address" TEXT NOT NULL,
    "isDouble" BOOLEAN NOT NULL DEFAULT false,
    "matchedArea" TEXT,
    "loggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "rateItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "driverAmount" DECIMAL(12,2) NOT NULL,
    "helperAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_items" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "driverRate" DECIMAL(12,2) NOT NULL,
    "helperRate" DECIMAL(12,2) NOT NULL,
    "driverRateDouble" DECIMAL(12,2) NOT NULL,
    "helperRateDouble" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rate_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "double_rate_areas" (
    "id" TEXT NOT NULL,
    "areaName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "double_rate_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LoanType" NOT NULL DEFAULT 'CASH_ADVANCE',
    "principal" DECIMAL(12,2) NOT NULL,
    "dateGranted" DATE NOT NULL,
    "deductionPerRun" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_entries" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "payslipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sss_brackets" (
    "id" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "salaryFrom" DECIMAL(12,2) NOT NULL,
    "salaryTo" DECIMAL(12,2) NOT NULL,
    "employeeShare" DECIMAL(12,2) NOT NULL,
    "employerShare" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sss_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "philhealth_config" (
    "id" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "salaryFloor" DECIMAL(12,2) NOT NULL,
    "salaryCeiling" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "philhealth_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagibig_config" (
    "id" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "employeeAmount" DECIMAL(12,2) NOT NULL,
    "employerAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pagibig_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bir_brackets" (
    "id" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "incomeFrom" DECIMAL(12,2) NOT NULL,
    "incomeTo" DECIMAL(12,2),
    "baseTax" DECIMAL(12,2) NOT NULL,
    "percentOverExcess" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "bir_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollType" "PayrollType" NOT NULL,
    "daysPresent" INTEGER NOT NULL DEFAULT 0,
    "basicPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtimeWeekday" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtimeWeekend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pieceRateTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "palimaBonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sssDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "philhealthDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pagibigDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mp2Deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "withholdingTax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loanDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tardinessDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "employees_position_idx" ON "employees"("position");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "attendance_date_idx" ON "attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employeeId_date_key" ON "attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "unmapped_logs_isResolved_idx" ON "unmapped_logs"("isResolved");

-- CreateIndex
CREATE INDEX "deliveries_date_idx" ON "deliveries"("date");

-- CreateIndex
CREATE INDEX "deliveries_driverId_idx" ON "deliveries"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_truckId_date_sequenceNo_key" ON "deliveries"("truckId", "date", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "rate_items_itemName_unit_key" ON "rate_items"("itemName", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "double_rate_areas_areaName_key" ON "double_rate_areas"("areaName");

-- CreateIndex
CREATE INDEX "loans_employeeId_idx" ON "loans"("employeeId");

-- CreateIndex
CREATE INDEX "loan_entries_loanId_date_idx" ON "loan_entries"("loanId", "date");

-- CreateIndex
CREATE INDEX "sss_brackets_effectiveYear_idx" ON "sss_brackets"("effectiveYear");

-- CreateIndex
CREATE UNIQUE INDEX "philhealth_config_effectiveYear_key" ON "philhealth_config"("effectiveYear");

-- CreateIndex
CREATE UNIQUE INDEX "pagibig_config_effectiveYear_key" ON "pagibig_config"("effectiveYear");

-- CreateIndex
CREATE INDEX "bir_brackets_effectiveYear_idx" ON "bir_brackets"("effectiveYear");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_startDate_endDate_key" ON "payroll_periods"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollPeriodId_employeeId_key" ON "payslips"("payrollPeriodId", "employeeId");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmapped_logs" ADD CONSTRAINT "unmapped_logs_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_usualDriverId_fkey" FOREIGN KEY ("usualDriverId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_helper1Id_fkey" FOREIGN KEY ("helper1Id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_helper2Id_fkey" FOREIGN KEY ("helper2Id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_rateItemId_fkey" FOREIGN KEY ("rateItemId") REFERENCES "rate_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_entries" ADD CONSTRAINT "loan_entries_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
