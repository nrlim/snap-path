import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/rbac";
import { createSnaptextJob } from "@/lib/snaptext";
import { ocrProcessingWorkflow } from "@/workflows/ocr-processing";

const DEFAULT_MAX_PDF_SIZE = 100 * 1024 * 1024;
const MAX_TXT_CONTENT_LENGTH = 2 * 1024 * 1024;

const OcrProcessRequestSchema = z.object({
  pdfPath: z.string().trim().min(1),
  pdfUrl: z.string().trim().url(),
  pdfName: z.string().trim().min(1),
  pdfSize: z.number().int().positive(),
  pdfHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  txtContent: z.string().max(MAX_TXT_CONTENT_LENGTH),
});

interface OcrUploadResponse {
  success?: boolean;
  ocrJobId?: string;
  snaptextJobId?: string;
  snaptextStatus?: string;
  status?: string;
  ocrWorkflowRunId?: string;
  backgroundPollingStarted?: boolean;
  error?: string;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getMaxPdfSize(): number {
  const rawLimitMb = process.env.OCR_MAX_PDF_UPLOAD_MB ?? process.env.SUPABASE_DOCUMENT_BUCKET_FILE_SIZE_LIMIT_MB;
  if (!rawLimitMb) return DEFAULT_MAX_PDF_SIZE;

  const parsedLimitMb = Number.parseInt(rawLimitMb, 10);
  if (!Number.isFinite(parsedLimitMb) || parsedLimitMb <= 0) return DEFAULT_MAX_PDF_SIZE;

  return parsedLimitMb * 1024 * 1024;
}

function formatMegabytes(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))}MB`;
}

export async function POST(req: NextRequest): Promise<NextResponse<OcrUploadResponse>> {
  try {
    const session = await getSession();
    if (!session || typeof session.sub !== "string") {
      return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });
    }

    const parseResult = OcrProcessRequestSchema.safeParse(await req.json());
    if (!parseResult.success) {
      return NextResponse.json({ error: "Parameter pdfPath, pdfUrl, pdfName, pdfSize, pdfHash, dan txtContent wajib diisi dengan benar." }, { status: 400 });
    }

    const { pdfPath, pdfUrl, pdfName, pdfSize, pdfHash, txtContent } = parseResult.data;
    const maxPdfSize = getMaxPdfSize();

    if (pdfSize > maxPdfSize) {
      return NextResponse.json({ error: `Ukuran PDF melebihi batas ${formatMegabytes(maxPdfSize)}.` }, { status: 400 });
    }

    const fileHash = pdfHash.toLowerCase();
    const snaptextJob = await createSnaptextJob(pdfUrl, pdfName, pdfSize, fileHash);

    const ocrJob = await prisma.ocrJob.create({
      data: {
        clientId: user.clientId,
        providerId: null,
        pdfStoragePath: pdfPath,
        pdfUrl,
        txtStoragePath: null,
        txtContent,
        snaptextJobId: snaptextJob.jobId,
        snaptextStatus: snaptextJob.status || "PENDING",
        ocrRawResult: toJsonValue({ uploadAcceptedAt: new Date().toISOString() }),
        status: "OCR_PROCESSING",
      },
    });

    let ocrWorkflowRunId: string | undefined;
    let backgroundPollingStarted = false;

    try {
      const run = await start(ocrProcessingWorkflow, [{ ocrJobId: ocrJob.id }]);
      ocrWorkflowRunId = run.runId;
      backgroundPollingStarted = true;
    } catch (workflowError: unknown) {
      console.error("[ocr/upload] failed to start OCR background workflow", workflowError);
    }

    return NextResponse.json({
      success: true,
      ocrJobId: ocrJob.id,
      snaptextJobId: snaptextJob.jobId,
      snaptextStatus: snaptextJob.status,
      status: ocrJob.status,
      ocrWorkflowRunId,
      backgroundPollingStarted,
    });
  } catch (error: unknown) {
    console.error("[ocr/upload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memproses unggahan OCR." },
      { status: 500 },
    );
  }
}
