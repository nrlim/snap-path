ALTER TABLE "SystemConfig"
  DROP COLUMN IF EXISTS "pathwayDailyLimitViewer",
  DROP COLUMN IF EXISTS "pathwayDailyLimitClientUser",
  DROP COLUMN IF EXISTS "pathwayDailyLimitClientAdmin",
  DROP COLUMN IF EXISTS "pathwayDailyLimitAdmin",
  DROP COLUMN IF EXISTS "pathwayDailyLimitSuperAdmin";

ALTER TABLE "Client"
  DROP COLUMN IF EXISTS "monthlyTokenLimit";
