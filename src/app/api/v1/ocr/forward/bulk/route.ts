import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { buildClaimDisplayMetadata } from "@/lib/claim-display";
import { assertClientHasRequestQuota, debitClientRequestUsage } from "@/lib/credits";
import { sanitizeClaimValidationInput } from "@/lib/ai/sanitizer";
import prisma from "@/lib/db";
import { buildClaimValidationPayloadFromOcr, buildClaimValidationPayloadFromAI, type OcrClaimValidationPayload } from "@/lib/ocr-claim-payload";
import { getAIGateway } from "@/lib/ai/gateway";
import type { OcrItem } from "@/lib/ocr-scoring";
import { resolveProviderFromOcrName } from "@/lib/ocr-job-processor";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";
import { resolveActualLosDays } from "@/lib/los";
import { claimValidationWorkflow } from "@/workflows/claim-validation";

const BulkForwardOcrSchema = z.object({
  ocrJobIds: z.array(z.string().uuid()).min(1),
});

interface OcrForwardResult {
  ocrJobId: string;
  success: boolean;
  status?: string;
  forwarded?: boolean;
  claimValidationSkipped?: boolean;
  claimJobId?: string;
  runId?: string;
  statusUrl?: string;
  claimValidationPayload?: unknown;
  mappingLog?: Record<string, string>;
  message?: string;
  error?: string;
  code?: string;
}

interface BulkForwardResponse {
  success: boolean;
  results: OcrForwardResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
  };
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

export async function POST(req: NextRequest): Promise<NextResponse<BulkForwardResponse | { error: string }>> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsedBody = BulkForwardOcrSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: "ocrJobIds wajib dikirim dan berupa array UUID." }, { status: 400 });
    }

    const ocrJobIds = parsedBody.data.ocrJobIds;
    const results: OcrForwardResult[] = [];

    const hasUnlimitedQuota = user.role === "SUPER_ADMIN";

    const chunkSize = 5;
    for (let i = 0; i < ocrJobIds.length; i += chunkSize) {
      const chunk = ocrJobIds.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (ocrJobId) => {
        try {
          const ocrJob = await prisma.ocrJob.findUnique({ where: { id: ocrJobId } });

          if (!ocrJob) {
            results.push({ ocrJobId, success: false, error: "Job OCR tidak ditemukan." });
            return;
          }

          if (!isPlatformAdminRole(user.role) && ocrJob.clientId !== user.clientId) {
            results.push({ ocrJobId, success: false, error: "Anda tidak memiliki akses ke job OCR ini." });
            return;
          }

          if (ocrJob.status === "FORWARDED" && ocrJob.claimJobId) {
            results.push({
              ocrJobId,
              success: true,
              status: "FORWARDED",
              forwarded: true,
              claimValidationSkipped: false,
              claimJobId: ocrJob.claimJobId,
              statusUrl: `/api/v1/claims/poll?jobId=${ocrJob.claimJobId}`,
              message: "Job OCR sudah diteruskan ke validasi klaim.",
            });
            return;
          }

          if (ocrJob.matchScore !== 100) {
            results.push({ ocrJobId, success: false, error: "Skor OCR harus 100% sebelum data diteruskan ke validasi klaim." });
            return;
          }

          const resolvedClientId = ocrJob.clientId;
          if (!resolvedClientId) {
            results.push({
              ocrJobId,
              success: false,
              error: "Client tidak dapat ditentukan dari job OCR.",
              code: "CLIENT_REQUIRED",
            });
            return;
          }

          const client = await prisma.client.findUnique({ where: { id: resolvedClientId }, select: { id: true, isActive: true } });
          if (!client?.isActive) {
            results.push({ ocrJobId, success: false, error: "Client tidak aktif atau tidak ditemukan.", code: "CLIENT_INACTIVE" });
            return;
          }

          let aiMappedPayload: any;
          if (ocrJob.aiMappedPayload) {
            aiMappedPayload = ocrJob.aiMappedPayload;
          } else {
            const gateway = await getAIGateway({ clientId: resolvedClientId });
            const result = await gateway.mapArbitraryJsonToClaim(ocrJob.ocrRawResult, true);
            aiMappedPayload = result.data;
            
            await prisma.ocrJob.update({
              where: { id: ocrJob.id },
              data: { aiMappedPayload: aiMappedPayload as any }
            });
          }

          let providerId = ocrJob.providerId;
          if (!providerId && aiMappedPayload.encounter?.facility?.name) {
            const resolvedProvider = await resolveProviderFromOcrName(aiMappedPayload.encounter.facility.name, resolvedClientId);
            if (resolvedProvider) {
              providerId = resolvedProvider.id;
              await prisma.ocrJob.update({
                where: { id: ocrJob.id },
                data: { providerId }
              });
            }
          }

          if (!providerId) {
            results.push({
              ocrJobId,
              success: false,
              error: "Provider dari invoice belum berhasil dicocokkan dengan master data.",
              code: "OCR_PROVIDER_UNRESOLVED",
            });
            return;
          }

          const provider = await prisma.provider.findUnique({
            where: { id: providerId },
            select: { id: true, name: true, clientId: true, isActive: true },
          });

          if (!provider?.isActive) {
            results.push({ ocrJobId, success: false, error: "Provider hasil OCR tidak aktif atau tidak ditemukan.", code: "PROVIDER_INACTIVE" });
            return;
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
            ocrItems: parseOcrItems(ocrJob.ocrItems),
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

        if (!hasUnlimitedQuota) {
          const requestPreflight = await assertClientHasRequestQuota(resolvedClientId);
          if (!requestPreflight.success) {
            results.push({
              ocrJobId,
              success: false,
              error: "Kuota request client tidak mencukupi. Silakan hubungi admin untuk top up request.",
              code: "CLIENT_REQUEST_QUOTA_INSUFFICIENT",
            });
            return;
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
            description: "Clinical Pathway validation request from SnapText OCR invoice (Bulk)",
          });

          if (!requestDebit.success) {
            await prisma.claimJob.update({
              where: { id: claimJob.id },
              data: { status: "FAILED", errorMessage: "Kuota request client tidak mencukupi." },
            });

            results.push({
              ocrJobId,
              success: false,
              error: "Kuota request client tidak mencukupi. Silakan hubungi admin untuk top up request.",
              code: "CLIENT_REQUEST_QUOTA_INSUFFICIENT",
            });
            return;
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

        results.push({
          ocrJobId,
          success: true,
          status: "FORWARDED",
          forwarded: true,
          claimValidationSkipped: false,
          claimJobId: claimJob.id,
          runId: run.runId,
          statusUrl: `/api/v1/claims/poll?runId=${run.runId}&jobId=${claimJob.id}`,
        });
      } catch (error: unknown) {
        console.error(`[ocr/forward/bulk] Gagal memproses OCR Job ID: ${ocrJobId}`, error);
        results.push({
          ocrJobId,
          success: false,
          error: error instanceof Error ? error.message : "Gagal meneruskan data OCR ke validasi klaim.",
        });
      }
    }));
  }

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
      },
    });
  } catch (error: unknown) {
    console.error("[ocr/forward/bulk]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memproses bulk forward." },
      { status: 500 },
    );
  }
}
