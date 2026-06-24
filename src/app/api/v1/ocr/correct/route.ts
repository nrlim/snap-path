import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { buildClaimValidationPayloadFromOcr } from "@/lib/ocr-claim-payload";
import { applyCorrectionsAndRescore, parseOcrResult, parseTxtGroundTruth, type OcrItem, type TxtItem } from "@/lib/ocr-scoring";
import { resolveProviderFromOcrName, getProviderNameFromOcrItems } from "@/lib/ocr-job-processor";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";

const CorrectOcrSchema = z.object({
  ocrJobId: z.string().uuid(),
  corrections: z.record(z.string(), z.string()).optional(),
  ocrRawResult: z.unknown().optional(),
});

interface OcrCorrectResponse {
  success?: boolean;
  status?: string;
  matchScore?: number;
  scoringDetails?: unknown;
  ocrItems?: unknown;
  claimValidationPayload?: unknown;
  claimValidationPayloadReady?: boolean;
  claimValidationSkipped?: boolean;
  error?: string;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOcrItem(value: unknown): value is OcrItem {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.field === "string" &&
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    typeof value.valueType === "string" &&
    (value.rawValue === null || ["string", "number", "boolean"].includes(typeof value.rawValue)) &&
    (value.correctedValue === undefined || typeof value.correctedValue === "string")
  );
}

function isTxtItem(value: unknown): value is TxtItem {
  if (!isRecord(value)) return false;

  return (
    typeof value.field === "string" &&
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    typeof value.valueType === "string" &&
    (value.rawValue === null || ["string", "number", "boolean"].includes(typeof value.rawValue))
  );
}

function parseOcrItems(value: unknown): OcrItem[] {
  return Array.isArray(value) ? value.filter(isOcrItem) : [];
}

function parseTxtItems(value: unknown): TxtItem[] {
  return Array.isArray(value) ? value.filter(isTxtItem) : [];
}

export async function POST(req: NextRequest): Promise<NextResponse<OcrCorrectResponse>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsedBody = CorrectOcrSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: "Payload koreksi OCR tidak valid." }, { status: 400 });
    }

    const { ocrJobId, corrections } = parsedBody.data;
    const ocrJob = await prisma.ocrJob.findUnique({ where: { id: ocrJobId } });

    if (!ocrJob) {
      return NextResponse.json({ error: "Job OCR tidak ditemukan." }, { status: 404 });
    }

    if (!isPlatformAdminRole(user.role) && ocrJob.clientId !== user.clientId) {
      return NextResponse.json({ error: "Anda tidak memiliki akses ke job OCR ini." }, { status: 403 });
    }

    if (ocrJob.status === "FORWARDED") {
      return NextResponse.json({ error: "Job OCR sudah diteruskan." }, { status: 400 });
    }

    let txtItems = parseTxtItems(ocrJob.txtItems);
    if (ocrJob.txtContent) {
      const parsedTxtItems = parseTxtGroundTruth(ocrJob.txtContent);
      if (parsedTxtItems.length > 0) {
        txtItems = parsedTxtItems;
      }
    }

    if (txtItems.length === 0) {
      return NextResponse.json({ error: "TXT ground truth belum tersedia atau tidak dapat diparse." }, { status: 400 });
    }

    let currentOcrItems = parseOcrItems(ocrJob.ocrItems);
    let finalOcrRawResult = ocrJob.ocrRawResult;

    if (parsedBody.data.ocrRawResult !== undefined) {
      finalOcrRawResult = parsedBody.data.ocrRawResult;
      // Re-parse the items from the newly provided raw JSON
      currentOcrItems = parseOcrResult(finalOcrRawResult);
    }

    const { updatedItems, scoring } = applyCorrectionsAndRescore(currentOcrItems, corrections ?? {}, txtItems);
    
    // Re-resolve provider from updated items
    const updatedProviderName = getProviderNameFromOcrItems(updatedItems);
    let resolvedProviderId = ocrJob.providerId;
    if (updatedProviderName) {
      const resolvedProvider = await resolveProviderFromOcrName(updatedProviderName, ocrJob.clientId);
      if (resolvedProvider) {
        resolvedProviderId = resolvedProvider.id;
      }
    }

    const claimValidationPayload = buildClaimValidationPayloadFromOcr({
      ocrJobId: ocrJob.id,
      clientId: ocrJob.clientId,
      providerId: resolvedProviderId,
      providerName: updatedProviderName,
      pdfUrl: ocrJob.pdfUrl,
      pdfStoragePath: ocrJob.pdfStoragePath,
      ocrItems: updatedItems,
      txtItems,
      ocrRawResult: finalOcrRawResult,
    });
    const nextStatus = scoring.score === 100 ? "APPROVED" : "REVIEW_NEEDED";

    await prisma.ocrJob.update({
      where: { id: ocrJob.id },
      data: {
        ocrRawResult: finalOcrRawResult === undefined ? Prisma.JsonNull : toJsonValue(finalOcrRawResult),
        ocrItems: toJsonValue(updatedItems),
        matchScore: scoring.score,
        scoringDetails: toJsonValue(scoring.details),
        status: nextStatus,
        providerId: resolvedProviderId,
        reviewedByUserId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      status: nextStatus,
      matchScore: scoring.score,
      scoringDetails: scoring.details,
      ocrItems: updatedItems,
      claimValidationPayload: claimValidationPayload.payload,
      claimValidationPayloadReady: scoring.score === 100 && Boolean(resolvedProviderId),
      claimValidationSkipped: false,
    });
  } catch (error: unknown) {
    console.error("[ocr/correct]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menerapkan koreksi OCR." },
      { status: 500 },
    );
  }
}
