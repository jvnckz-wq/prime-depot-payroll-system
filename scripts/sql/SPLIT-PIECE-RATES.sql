-- Prime Depot: split the two combined piece-rate rows into separate items.
-- Copies the current rates from each combined row, then retires the combined row.
-- Past deliveries keep pointing to the retired row, so their amounts do not change.
-- Run once on Neon. No prisma generate or restart is needed (data only).
BEGIN;

INSERT INTO "rate_items" ("id", "itemName", "unit", "driverRate", "helperRate", "driverRateDouble", "helperRateDouble", "isActive")
SELECT gen_random_uuid()::text, n.name, r."unit", r."driverRate", r."helperRate", r."driverRateDouble", r."helperRateDouble", true
FROM "rate_items" r
CROSS JOIN unnest(ARRAY['Cement', 'Adhesive', 'Boral', 'Skimcoat', 'Sand']) AS n(name)
WHERE r."itemName" = 'Cement, Adhesive, Boral, Skimcoat, Sand'
ON CONFLICT ("itemName", "unit") DO UPDATE SET "isActive" = true;

INSERT INTO "rate_items" ("id", "itemName", "unit", "driverRate", "helperRate", "driverRateDouble", "helperRateDouble", "isActive")
SELECT gen_random_uuid()::text, n.name, r."unit", r."driverRate", r."helperRate", r."driverRateDouble", r."helperRateDouble", true
FROM "rate_items" r
CROSS JOIN unnest(ARRAY['Steel', 'Wood', 'Plywood', 'Pipe', 'Roofing Items']) AS n(name)
WHERE r."itemName" = 'Steel, Wood, Plywood, Pipe, Roofing Items'
ON CONFLICT ("itemName", "unit") DO UPDATE SET "isActive" = true;

UPDATE "rate_items" SET "isActive" = false
WHERE "itemName" IN ('Cement, Adhesive, Boral, Skimcoat, Sand', 'Steel, Wood, Plywood, Pipe, Roofing Items');

COMMIT;
