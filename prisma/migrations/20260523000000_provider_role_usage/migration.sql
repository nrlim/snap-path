-- Client-specific API credentials, role management, and usage logging.
-- Note: Provider remains claim/tariff provider. Client is SnapPath API customer/tenant.

CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER', 'VIEWER');

CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "aiProvider" TEXT,
  "aiGatewayUrl" TEXT,
  "aiModel" TEXT,
  "aiMaxTokens" INTEGER,
  "aiTemperature" DOUBLE PRECISION,
  "monthlyTokenLimit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
  ADD COLUMN "clientId" TEXT;

ALTER TABLE "Provider"
  ADD COLUMN "clientId" TEXT;

ALTER TABLE "ApiKey"
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "secretHash" TEXT,
  ADD COLUMN "keyCipher" TEXT,
  ADD COLUMN "secretCipher" TEXT;

ALTER TABLE "ApiUsageLog"
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "providerId" TEXT,
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "requestType" TEXT NOT NULL DEFAULT 'API',
  ADD COLUMN "aiProvider" TEXT,
  ADD COLUMN "aiModel" TEXT,
  ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ApiUsageLog" ALTER COLUMN "apiKeyId" DROP NOT NULL;

ALTER TABLE "ClaimJob"
  ADD COLUMN "clientId" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Provider"
  ADD CONSTRAINT "Provider_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiUsageLog"
  ADD CONSTRAINT "ApiUsageLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiUsageLog"
  ADD CONSTRAINT "ApiUsageLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClaimJob"
  ADD CONSTRAINT "ClaimJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_clientId_idx" ON "User"("clientId");
CREATE INDEX "User_role_idx" ON "User"("role");
DROP INDEX IF EXISTS "Provider_code_key";
CREATE INDEX "Provider_clientId_idx" ON "Provider"("clientId");
CREATE UNIQUE INDEX "Provider_clientId_code_key" ON "Provider"("clientId", "code");
CREATE INDEX "ApiKey_clientId_idx" ON "ApiKey"("clientId");
CREATE INDEX "ApiUsageLog_clientId_idx" ON "ApiUsageLog"("clientId");
CREATE INDEX "ApiUsageLog_providerId_idx" ON "ApiUsageLog"("providerId");
CREATE INDEX "ApiUsageLog_jobId_idx" ON "ApiUsageLog"("jobId");
CREATE INDEX "ApiUsageLog_requestType_createdAt_idx" ON "ApiUsageLog"("requestType", "createdAt");
CREATE INDEX "ClaimJob_clientId_idx" ON "ClaimJob"("clientId");
