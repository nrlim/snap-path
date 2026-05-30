ALTER TABLE "Client"
  ADD COLUMN "creditBalance" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CreditLedger" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "jobId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditLedger_clientId_createdAt_idx" ON "CreditLedger"("clientId", "createdAt");
CREATE INDEX "CreditLedger_jobId_idx" ON "CreditLedger"("jobId");

ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
