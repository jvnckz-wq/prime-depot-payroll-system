/*
  Warnings:

  - You are about to drop the column `employeeAmount` on the `pagibig_config` table. All the data in the column will be lost.
  - You are about to drop the column `employerAmount` on the `pagibig_config` table. All the data in the column will be lost.
  - Added the required column `monthlyCap` to the `pagibig_config` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "pagibig_config" DROP COLUMN "employeeAmount",
DROP COLUMN "employerAmount",
ADD COLUMN     "monthlyCap" DECIMAL(12,2) NOT NULL;

-- CreateTable
CREATE TABLE "pagibig_brackets" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "salaryUpTo" DECIMAL(12,2),
    "employeePercent" DECIMAL(5,2) NOT NULL,
    "employerPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pagibig_brackets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pagibig_brackets" ADD CONSTRAINT "pagibig_brackets_configId_fkey" FOREIGN KEY ("configId") REFERENCES "pagibig_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;
