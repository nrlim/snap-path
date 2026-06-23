import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/db";
import { processOcrJobSnaptextStatus, type OcrJobProcessingResult } from "@/lib/ocr-job-processor";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";

interface OcrPollResponse extends OcrJobProcessingResult {
  claimValidationSkipped?: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse<OcrPollResponse>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { status: "UNAUTHORIZED", snaptextStatus: "UNAUTHORIZED", terminal: true, retryable: false, error: "Sesi tidak valid. Silakan masuk kembali." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const ocrJobId = searchParams.get("ocrJobId");

    if (!ocrJobId) {
      return NextResponse.json(
        { status: "BAD_REQUEST", snaptextStatus: "BAD_REQUEST", terminal: true, retryable: false, error: "ocrJobId wajib dikirim." },
        { status: 400 },
      );
    }

    const ocrJob = await prisma.ocrJob.findUnique({
      where: { id: ocrJobId },
      select: { id: true, clientId: true },
    });

    if (!ocrJob) {
      return NextResponse.json(
        { status: "NOT_FOUND", snaptextStatus: "NOT_FOUND", terminal: true, retryable: false, error: "Job OCR tidak ditemukan." },
        { status: 404 },
      );
    }

    if (!isPlatformAdminRole(user.role) && ocrJob.clientId !== user.clientId) {
      return NextResponse.json(
        { status: "FORBIDDEN", snaptextStatus: "FORBIDDEN", terminal: true, retryable: false, error: "Anda tidak memiliki akses ke job OCR ini." },
        { status: 403 },
      );
    }

    const result = await processOcrJobSnaptextStatus(ocrJobId);
    const httpStatus = result.status === "NOT_FOUND" ? 404 : 200;

    return NextResponse.json({
      ...result,
      claimValidationSkipped: false,
    }, { status: httpStatus });
  } catch (error: unknown) {
    console.error("[ocr/poll]", error);
    return NextResponse.json(
      {
        status: "ERROR",
        snaptextStatus: "ERROR",
        terminal: false,
        retryable: true,
        error: error instanceof Error ? error.message : "Gagal mengecek status OCR.",
      },
      { status: 500 },
    );
  }
}
