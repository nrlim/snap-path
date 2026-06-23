-- CreateTable
CREATE TABLE "snp_ocr_job" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "providerId" TEXT,
    "pdfStoragePath" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "txtStoragePath" TEXT,
    "txtContent" TEXT,
    "snaptextJobId" TEXT,
    "snaptextStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ocrRawResult" JSONB,
    "ocrItems" JSONB,
    "txtItems" JSONB,
    "matchScore" DOUBLE PRECISION,
    "scoringDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimJobId" TEXT,
    "errorMessage" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snp_ocr_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "snp_ocr_job_clientId_idx" ON "snp_ocr_job"("clientId");

-- CreateIndex
CREATE INDEX "snp_ocr_job_status_idx" ON "snp_ocr_job"("status");

-- CreateIndex
CREATE INDEX "snp_ocr_job_claimJobId_idx" ON "snp_ocr_job"("claimJobId");

-- AddForeignKey
ALTER TABLE "snp_ocr_job" ADD CONSTRAINT "snp_ocr_job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "snp_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snp_ocr_job" ADD CONSTRAINT "snp_ocr_job_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "snp_provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
