ALTER TABLE IF EXISTS "MedicalItemPriceCache"
  ADD COLUMN IF NOT EXISTS "fixPrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "hetPrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "maxReferencePrice" DOUBLE PRECISION;

UPDATE "MedicalItemPriceCache"
SET "maxReferencePrice" = COALESCE("maxReferencePrice", "marketPriceMax"),
    "hetPrice" = COALESCE("hetPrice", CASE WHEN "sources"::text NOT LIKE '%master_data_kfa%' THEN "marketPriceMax" ELSE NULL END)
WHERE "maxReferencePrice" IS NULL OR "hetPrice" IS NULL;
