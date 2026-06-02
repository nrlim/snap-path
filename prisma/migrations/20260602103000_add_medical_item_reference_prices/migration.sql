ALTER TABLE IF EXISTS "MedicalItemPriceMaster"
  ADD COLUMN IF NOT EXISTS "fixPrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "hetPrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "maxReferencePrice" DOUBLE PRECISION;

UPDATE "MedicalItemPriceMaster"
SET "maxReferencePrice" = COALESCE("maxReferencePrice", "marketPriceMax"),
    "hetPrice" = COALESCE("hetPrice", CASE WHEN "sources"::text NOT LIKE '%master_data%' THEN "marketPriceMax" ELSE NULL END)
WHERE "maxReferencePrice" IS NULL OR "hetPrice" IS NULL;
