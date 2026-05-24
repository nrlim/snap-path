ALTER TABLE "SystemConfig"
  ADD COLUMN "pathwayDailyLimitViewer" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "pathwayDailyLimitClientUser" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "pathwayDailyLimitClientAdmin" INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN "pathwayDailyLimitAdmin" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pathwayDailyLimitSuperAdmin" INTEGER NOT NULL DEFAULT 0;
