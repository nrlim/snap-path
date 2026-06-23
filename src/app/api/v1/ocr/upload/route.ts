import crypto from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/rbac";
import { createSnaptextJob } from "@/lib/snaptext";
import { uploadClaimDocumentToSupabaseStorage } from "@/lib/supabase-storage";
import { ocrProcessingWorkflow } from "@/workflows/ocr-processing";

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_TXT_SIZE = 2 * 1024 * 1024;

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

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, "_");
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

    const formData = await req.formData();
    const pdfFile = formData.get("pdfFile");
    const txtFile = formData.get("txtFile");

    if (!(pdfFile instanceof File) || pdfFile.type !== "application/pdf") {
      return NextResponse.json({ error: "File PDF invoice yang valid wajib diunggah." }, { status: 400 });
    }

    if (!(txtFile instanceof File)) {
      return NextResponse.json({ error: "File TXT ground truth wajib diunggah." }, { status: 400 });
    }

    if (pdfFile.size > MAX_PDF_SIZE) {
      return NextResponse.json({ error: "Ukuran PDF melebihi batas 20MB." }, { status: 400 });
    }

    if (txtFile.size > MAX_TXT_SIZE) {
      return NextResponse.json({ error: "Ukuran TXT melebihi batas 2MB." }, { status: 400 });
    }

    const clientId = user.clientId;
    const timestamp = Date.now();
    const clientSegment = clientId ?? "global";
    const pdfPath = `ocr/${clientSegment}/${timestamp}_${sanitizeFilename(pdfFile.name)}`;
    const txtPath = `ocr/${clientSegment}/${timestamp}_${sanitizeFilename(txtFile.name)}`;

    const [supabasePdf, supabaseTxt, txtContent, pdfArrayBuffer] = await Promise.all([
      uploadClaimDocumentToSupabaseStorage(pdfFile, pdfPath),
      uploadClaimDocumentToSupabaseStorage(txtFile, txtPath),
      txtFile.text(),
      pdfFile.arrayBuffer(),
    ]);

    const supabasePdfUrl = supabasePdf.signedUrl;
    if (!supabasePdfUrl) {
      return NextResponse.json({ error: "Gagal mendapatkan URL file PDF dari storage." }, { status: 500 });
    }

    const pdfBuffer = Buffer.from(pdfArrayBuffer);
    const fileHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const snaptextJob = await createSnaptextJob(supabasePdfUrl, pdfFile.name, pdfFile.size, fileHash);

    const ocrJob = await prisma.ocrJob.create({
      data: {
        clientId,
        providerId: null,
        pdfStoragePath: supabasePdf.path,
        pdfUrl: supabasePdfUrl,
        txtStoragePath: supabaseTxt.path,
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
      { error: error instanceof Error ? error.message : "Gagal memproses upload OCR." },
      { status: 500 },
    );
  }
}
