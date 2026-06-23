import { processOcrJobSnaptextStatus, type OcrJobProcessingResult } from "@/lib/ocr-job-processor";
import prisma from "@/lib/db";

export interface OcrProcessingPayload {
  ocrJobId: string;
}

export async function pollSnaptextOcrStep(input: OcrProcessingPayload): Promise<OcrJobProcessingResult> {
  "use step";

  return processOcrJobSnaptextStatus(input.ocrJobId);
}
pollSnaptextOcrStep.maxRetries = 2;

export async function markOcrPollingTimeoutStep(input: OcrProcessingPayload): Promise<void> {
  "use step";

  const job = await prisma.ocrJob.findUnique({
    where: { id: input.ocrJobId },
    select: { status: true },
  });

  if (!job || !["OCR_PROCESSING", "PENDING", "SCORING"].includes(job.status)) return;

  await prisma.ocrJob.update({
    where: { id: input.ocrJobId },
    data: {
      status: "OCR_PROCESSING",
      errorMessage: "Polling otomatis OCR mencapai batas waktu. Buka ulang halaman review untuk mengecek status SnapText terbaru.",
    },
  });
}
markOcrPollingTimeoutStep.maxRetries = 1;
