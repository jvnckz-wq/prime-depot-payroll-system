-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "earlyShiftDays" "Weekday"[],
ADD COLUMN     "earlyShiftTime" TEXT;

-- CreateIndex
CREATE INDEX "deliveries_voidedAt_idx" ON "deliveries"("voidedAt");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
