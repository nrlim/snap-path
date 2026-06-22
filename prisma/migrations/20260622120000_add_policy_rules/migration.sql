-- Policy & benefit rule master data
CREATE TABLE "snp_policy_rule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "policyProductCode" TEXT,
    "ruleCode" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "targetType" TEXT,
    "targetCode" TEXT,
    "targetPattern" TEXT,
    "conditionJson" JSONB,
    "actionJson" JSONB,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "recommendation" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snp_policy_rule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "snp_policy_rule_clientId_status_idx" ON "snp_policy_rule"("clientId", "status");
CREATE INDEX "snp_policy_rule_policyProductCode_idx" ON "snp_policy_rule"("policyProductCode");
CREATE INDEX "snp_policy_rule_ruleType_targetType_idx" ON "snp_policy_rule"("ruleType", "targetType");
CREATE INDEX "snp_policy_rule_targetCode_idx" ON "snp_policy_rule"("targetCode");
CREATE UNIQUE INDEX "snp_policy_rule_clientId_ruleCode_key" ON "snp_policy_rule"("clientId", "ruleCode");

ALTER TABLE "snp_policy_rule"
  ADD CONSTRAINT "snp_policy_rule_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "snp_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
