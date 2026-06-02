ALTER TABLE IF EXISTS "DrugPriceCache" RENAME TO "MedicalItemPriceCache";

ALTER TABLE IF EXISTS "MedicalItemPriceCache" RENAME COLUMN "drugName" TO "itemName";
ALTER TABLE IF EXISTS "MedicalItemPriceCache" RENAME COLUMN "drugGenericName" TO "itemGenericName";

ALTER TABLE IF EXISTS "MedicalItemPriceCache"
  ADD COLUMN IF NOT EXISTS "itemTypeCode" TEXT,
  ADD COLUMN IF NOT EXISTS "itemTypeName" TEXT,
  ADD COLUMN IF NOT EXISTS "itemGroup" TEXT;

DROP INDEX IF EXISTS "DrugPriceCache_drugName_idx";
DROP INDEX IF EXISTS "DrugPriceCache_drugGenericName_idx";

CREATE INDEX IF NOT EXISTS "MedicalItemPriceCache_itemName_idx" ON "MedicalItemPriceCache"("itemName");
CREATE INDEX IF NOT EXISTS "MedicalItemPriceCache_itemGenericName_idx" ON "MedicalItemPriceCache"("itemGenericName");
CREATE INDEX IF NOT EXISTS "MedicalItemPriceCache_itemTypeCode_idx" ON "MedicalItemPriceCache"("itemTypeCode");
CREATE INDEX IF NOT EXISTS "MedicalItemPriceCache_itemGroup_idx" ON "MedicalItemPriceCache"("itemGroup");
