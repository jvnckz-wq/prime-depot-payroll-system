-- Delivery detail fields.
-- `landmark` carries the specific address / landmark a driver actually
-- navigates by (purok, sitio, gate colour, "beside the chapel"); `contactNo`
-- the receiver's phone, so the driver can call when near or lost. Both are
-- nullable — existing rows have neither — and the broad `address` column, which
-- still drives double-rate matching, is left unchanged.

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "landmark" TEXT;
ALTER TABLE "deliveries" ADD COLUMN     "contactNo" TEXT;
