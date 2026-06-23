import crypto from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/rbac";
import { createSnaptextJob } from "@/lib/snaptext";
import { downloadClaimDocument, createSignedUrl } from "@/lib/supabase-storage";
import { ocrProcessingWorkflow } from "@/workflows/ocr-processing";

interface OcrProcessRequest {
  pdfPath: string;
  pdfName: string;
  pdfSize: number;
  txtPath: string;
}

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

    const body = await req.json() as Partial<OcrProcessRequest>;
    const { pdfPath, pdfName, pdfSize, txtPath } = body;

    if (!pdfPath || !pdfName || typeof pdfSize !== "number" || !txtPath) {
      return NextResponse.json({ error: "Parameter pdfPath, pdfName, pdfSize, dan txtPath wajib diisi." }, { status: 400 });
    }

    const [pdfArrayBuffer, txtArrayBuffer] = await Promise.all([
      downloadClaimDocument(pdfPath),
      downloadClaimDocument(txtPath),
    ]);

    const txtContent = new TextDecoder().decode(txtArrayBuffer);
    
    const bucket = process.env.SUPABASE_DOCUMENT_BUCKET || "claim-documents";
    const supabasePdfUrl = await createSignedUrl(bucket, pdfPath, 60 * 60 * 24 * 7);

    if (!supabasePdfUrl) {
      return NextResponse.json({ error: "Gagal mendapatkan URL file PDF dari storage." }, { status: 500 });
    }

    const pdfBuffer = Buffer.from(pdfArrayBuffer);
    const fileHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const snaptextJob = await createSnaptextJob(supabasePdfUrl, pdfName, pdfSize, fileHash);

    const ocrJob = await prisma.ocrJob.create({
      data: {
        clientId: user.clientId,
        providerId: null,
        pdfStoragePath: pdfPath,
        pdfUrl: supabasePdfUrl,
        txtStoragePath: txtPath,
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
