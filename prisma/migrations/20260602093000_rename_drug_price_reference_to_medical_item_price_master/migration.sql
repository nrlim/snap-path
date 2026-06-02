ALTER TABLE IF EXISTS "DrugPriceCache" RENAME TO "MedicalItemPriceMaster";

ALTER TABLE IF EXISTS "MedicalItemPriceMaster" RENAME COLUMN "drugName" TO "itemName";
ALTER TABLE IF EXISTS "MedicalItemPriceMaster" RENAME COLUMN "drugGenericName" TO "itemGenericName";

ALTER TABLE IF EXISTS "MedicalItemPriceMaster"
  ADD COLUMN IF NOT EXISTS "itemTypeCode" TEXT,
  ADD COLUMN IF NOT EXISTS "itemTypeName" TEXT,
  ADD COLUMN IF NOT EXISTS "itemGroup" TEXT;

DROP INDEX IF EXISTS "DrugPriceCache_drugName_idx";
DROP INDEX IF EXISTS "DrugPriceCache_drugGenericName_idx";

CREATE INDEX IF NOT EXISTS "MedicalItemPriceMaster_itemName_idx" ON "MedicalItemPriceMaster"("itemName");
CREATE INDEX IF NOT EXISTS "MedicalItemPriceMaster_itemGenericName_idx" ON "MedicalItemPriceMaster"("itemGenericName");
CREATE INDEX IF NOT EXISTS "MedicalItemPriceMaster_itemTypeCode_idx" ON "MedicalItemPriceMaster"("itemTypeCode");
CREATE INDEX IF NOT EXISTS "MedicalItemPriceMaster_itemGroup_idx" ON "MedicalItemPriceMaster"("itemGroup");
