-- HITL review decisions and adjudication audit trail
CREATE TABLE "snp_claim_review_decision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "clientId" TEXT,
    "reviewerId" TEXT,
    "decision" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'DECIDED',
    "payableAmount" DOUBLE PRECISION,
    "excessAmount" DOUBLE PRECISION,
    "reasonCode" TEXT,
    "note" TEXT,
    "previousReviewStatus" TEXT,
    "nextReviewStatus" TEXT NOT NULL,
    "hitlPacket" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snp_claim_review_decision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "snp_claim_review_decision_jobId_createdAt_idx" ON "snp_claim_review_decision"("jobId", "createdAt");
CREATE INDEX "snp_claim_review_decision_clientId_createdAt_idx" ON "snp_claim_review_decision"("clientId", "createdAt");
CREATE INDEX "snp_claim_review_decision_reviewerId_createdAt_idx" ON "snp_claim_review_decision"("reviewerId", "createdAt");
CREATE INDEX "snp_claim_review_decision_decision_idx" ON "snp_claim_review_decision"("decision");

ALTER TABLE "snp_claim_review_decision"
  ADD CONSTRAINT "snp_claim_review_decision_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "snp_claim_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "snp_claim_review_decision"
  ADD CONSTRAINT "snp_claim_review_decision_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "snp_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "snp_claim_review_decision"
  ADD CONSTRAINT "snp_claim_review_decision_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "snp_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
