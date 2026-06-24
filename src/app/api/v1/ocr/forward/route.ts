import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { buildClaimDisplayMetadata } from "@/lib/claim-display";
import { assertClientHasRequestQuota, debitClientRequestUsage } from "@/lib/credits";
import { sanitizeClaimValidationInput } from "@/lib/ai/sanitizer";
import prisma from "@/lib/db";
import { buildClaimValidationPayloadFromAI, type OcrClaimValidationPayload } from "@/lib/ocr-claim-payload";
import { getAIGateway } from "@/lib/ai/gateway";
import type { OcrItem } from "@/lib/ocr-scoring";
import { resolveProviderFromOcrItems, resolveProviderFromOcrName } from "@/lib/ocr-job-processor";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";
import { resolveActualLosDays } from "@/lib/los";
import { claimValidationWorkflow } from "@/workflows/claim-validation";

const ForwardOcrSchema = z.object({
  ocrJobId: z.string().uuid(),
});

interface OcrForwardResponse {
  success?: boolean;
  status?: string;
  forwarded?: boolean;
  claimValidationSkipped?: boolean;
  claimJobId?: string;
  runId?: string;
  statusUrl?: string;
  redirectUrl?: string;
  claimValidationPayload?: unknown;
  mappingLog?: Record<string, string>;
  message?: string;
  error?: string;
  code?: string;
}

interface WorkflowPayload extends OcrClaimValidationPayload {
  requestedByUserId: string;
  requestedByUserRole: string;
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

function parseOcrItems(value: unknown): OcrItem[] {
  return Array.isArray(value) ? value.filter(isOcrItem) : [];
}

export async function POST(req: NextRequest): Promise<NextResponse<OcrForwardResponse>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsedBody = ForwardOcrSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: "ocrJobId wajib dikirim." }, { status: 400 });
    }

    const ocrJob = await prisma.ocrJob.findUnique({ where: { id: parsedBody.data.ocrJobId } });

    if (!ocrJob) {
      return NextResponse.json({ error: "Job OCR tidak ditemukan." }, { status: 404 });
    }

    if (!isPlatformAdminRole(user.role) && ocrJob.clientId !== user.clientId) {
      console.error("[ocr/forward] 403: Anda tidak memiliki akses ke job OCR ini.");
      return NextResponse.json({ error: "Anda tidak memiliki akses ke job OCR ini." }, { status: 403 });
    }

    if (ocrJob.status === "FORWARDED" && ocrJob.claimJobId) {
      return NextResponse.json({
        success: true,
        status: "FORWARDED",
        forwarded: true,
        claimValidationSkipped: false,
        claimJobId: ocrJob.claimJobId,
        statusUrl: `/api/v1/claims/poll?jobId=${ocrJob.claimJobId}`,
        redirectUrl: `/dashboard/clinical-pathway/${ocrJob.claimJobId}`,
        message: "Job OCR sudah diteruskan ke validasi klaim.",
      });
    }

    if (ocrJob.matchScore !== 100) {
      console.error("[ocr/forward] 400: Skor OCR harus 100%", { matchScore: ocrJob.matchScore });
      return NextResponse.json({ error: "Skor OCR harus 100% sebelum data diteruskan ke validasi klaim." }, { status: 400 });
    }

    const resolvedClientId = ocrJob.clientId;
    if (!resolvedClientId) {
      console.error("[ocr/forward] 400: Client tidak dapat ditentukan dari job OCR.");
      return NextResponse.json(
        { error: "Client tidak dapat ditentukan dari job OCR.", code: "CLIENT_REQUIRED" },
        { status: 400 },
      );
    }

    const client = await prisma.client.findUnique({ where: { id: resolvedClientId }, select: { id: true, isActive: true } });
    if (!client?.isActive) {
      return NextResponse.json({ error: "Client tidak aktif atau tidak ditemukan.", code: "CLIENT_INACTIVE" }, { status: 403 });
    }

    let aiMappedPayload: any;
    if (ocrJob.aiMappedPayload) {
      aiMappedPayload = ocrJob.aiMappedPayload;
    } else {
      try {
        const gateway = await getAIGateway({ clientId: resolvedClientId });
        const result = await gateway.mapArbitraryJsonToClaim(ocrJob.ocrRawResult, true);
        aiMappedPayload = result.data;
        
        await prisma.ocrJob.update({
          where: { id: ocrJob.id },
          data: { aiMappedPayload: aiMappedPayload as any }
        });
      } catch (err: unknown) {
        console.error("[ocr/forward] 500: AI Mapping failed:", err);
        throw err;
      }
    }

    const ocrItems = parseOcrItems(ocrJob.ocrItems);
    let providerId = ocrJob.providerId;
    if (!providerId) {
      const resolvedProvider = await resolveProviderFromOcrItems(ocrItems, resolvedClientId)
        ?? await resolveProviderFromOcrName(aiMappedPayload.encounter?.facility?.name ?? null, resolvedClientId);
      if (resolvedProvider) {
        providerId = resolvedProvider.id;
        await prisma.ocrJob.update({
          where: { id: ocrJob.id },
          data: { providerId },
        });
      }
    }

    if (!providerId) {
      console.error("[ocr/forward] 400: Provider dari invoice belum berhasil dicocokkan dengan master data.", { aiMappedFacility: aiMappedPayload.encounter?.facility });
      return NextResponse.json(
        {
          error: "Provider dari invoice belum berhasil dicocokkan dengan master data. Lengkapi master provider atau koreksi nama provider sebelum validasi klaim dijalankan.",
          code: "OCR_PROVIDER_UNRESOLVED",
        },
        { status: 400 },
      );
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true, name: true, clientId: true, isActive: true },
    });

    if (!provider?.isActive) {
      return NextResponse.json({ error: "Provider hasil OCR tidak aktif atau tidak ditemukan.", code: "PROVIDER_INACTIVE" }, { status: 403 });
    }

    // Apply bulk master data lookup to resolve procedure and medication codes
    const { resolvePayloadWithBulkMasterData } = await import("@/lib/bulk-master-matcher");
    aiMappedPayload = await resolvePayloadWithBulkMasterData(aiMappedPayload, provider.id);

    const payloadResult = buildClaimValidationPayloadFromAI(aiMappedPayload, {
      ocrJobId: ocrJob.id,
      clientId: resolvedClientId,
      providerId: provider.id,
      providerName: provider.name,
      pdfUrl: ocrJob.pdfUrl,
      pdfStoragePath: ocrJob.pdfStoragePath,
      ocrItems,
      txtItems: parseOcrItems(ocrJob.txtItems),
      ocrRawResult: ocrJob.ocrRawResult,
    });
    
    const basePayload = payloadResult.payload;
    const mappingLog = payloadResult.mappingLog;

    const actualLos = resolveActualLosDays(basePayload);
    if (actualLos > 0) {
      basePayload.extra = { ...basePayload.extra, los: String(actualLos) };
    }

    const payload: WorkflowPayload = {
      ...basePayload,
      requestedByUserId: user.id,
      requestedByUserRole: user.role,
    };

    const hasUnlimitedQuota = user.role === "SUPER_ADMIN";
    if (!hasUnlimitedQuota) {
      const requestPreflight = await assertClientHasRequestQuota(resolvedClientId);
      if (!requestPreflight.success) {
        return NextResponse.json(
          {
            error: "Kuota request client tidak mencukupi. Silakan hubungi admin untuk top up request.",
            code: "CLIENT_REQUEST_QUOTA_INSUFFICIENT",
          },
          { status: 402 },
        );
      }
    }

    const sanitizedPayload = sanitizeClaimValidationInput(payload);
    const uiDisplayCipher = buildClaimDisplayMetadata(payload);
    const claimJob = await prisma.claimJob.create({
      data: {
        jobType: "CLAIM_VALIDATION",
        status: "QUEUED",
        inputPayload: toJsonValue(sanitizedPayload),
        clientId: resolvedClientId,
        providerId: provider.id,
        metadata: uiDisplayCipher ? { uiDisplayCipher } : undefined,
      },
    });

    if (!hasUnlimitedQuota) {
      const requestDebit = await debitClientRequestUsage({
        clientId: resolvedClientId,
        jobId: claimJob.id,
        description: "Clinical Pathway validation request from SnapText OCR invoice",
      });

      if (!requestDebit.success) {
        await prisma.claimJob.update({
          where: { id: claimJob.id },
          data: { status: "FAILED", errorMessage: "Kuota request client tidak mencukupi." },
        });

        return NextResponse.json(
          {
            error: "Kuota request client tidak mencukupi. Silakan hubungi admin untuk top up request.",
            code: "CLIENT_REQUEST_QUOTA_INSUFFICIENT",
          },
          { status: 402 },
        );
      }
    }

    const run = await start(claimValidationWorkflow, [{ jobId: claimJob.id, payload }]);

    await prisma.$transaction([
      prisma.claimJob.update({
        where: { id: claimJob.id },
        data: { workflowRunId: run.runId },
      }),
      prisma.ocrJob.update({
        where: { id: ocrJob.id },
        data: {
          status: "FORWARDED",
          reviewedByUserId: user.id,
          claimJobId: claimJob.id,
          clientId: resolvedClientId,
          providerId: provider.id,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      status: "FORWARDED",
      forwarded: true,
      claimValidationSkipped: false,
      claimJobId: claimJob.id,
      runId: run.runId,
      statusUrl: `/api/v1/claims/poll?runId=${run.runId}&jobId=${claimJob.id}`,
      redirectUrl: `/dashboard/clinical-pathway/${claimJob.id}`,
      claimValidationPayload: payload,
      mappingLog,
      message: "Payload OCR berhasil dibuat dan validasi klaim telah dimulai.",
    });
  } catch (error: unknown) {
    console.error("[ocr/forward]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal meneruskan data OCR ke validasi klaim." },
      { status: 500 },
    );
  }
}
