/*
  Warnings:

  - You are about to drop the column `usualDriverId` on the `trucks` table. All the data in the column will be lost.
  - You are about to drop the column `usualHelper1` on the `trucks` table. All the data in the column will be lost.
  - You are about to drop the column `usualHelper2` on the `trucks` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "trucks" DROP CONSTRAINT "trucks_usualDriverId_fkey";

-- AlterTable
ALTER TABLE "trucks" DROP COLUMN "usualDriverId",
DROP COLUMN "usualHelper1",
DROP COLUMN "usualHelper2";
