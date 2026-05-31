ALTER TABLE "Client"
  ADD COLUMN "requestBalance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_requestBalance_nonnegative" CHECK ("requestBalance" >= 0);

CREATE TABLE "RequestLedger" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "jobId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestLedger_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RequestLedger"
  ADD CONSTRAINT "RequestLedger_amount_nonzero" CHECK ("amount" <> 0),
  ADD CONSTRAINT "RequestLedger_balanceAfter_nonnegative" CHECK ("balanceAfter" >= 0);

CREATE INDEX "RequestLedger_clientId_createdAt_idx" ON "RequestLedger"("clientId", "createdAt");
CREATE INDEX "RequestLedger_jobId_idx" ON "RequestLedger"("jobId");

ALTER TABLE "RequestLedger"
  ADD CONSTRAINT "RequestLedger_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
