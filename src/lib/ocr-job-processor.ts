import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { buildClaimValidationPayloadFromOcr } from "@/lib/ocr-claim-payload";

import { parseOcrResult, parseTxtGroundTruth, scoreOcrAgainstTxt, type OcrItem } from "@/lib/ocr-scoring";
import { pollSnaptextJob } from "@/lib/snaptext";
import { sanitizeSnaptextOcrResult } from "@/lib/snaptext/clean-result";

export interface OcrJobProcessingResult {
  status: string;
  snaptextStatus: string;
  terminal: boolean;
  retryable: boolean;
  matchScore?: number | null;
  scoringDetails?: unknown;
  ocrItems?: unknown;
  txtItems?: unknown;
  ocrRawResult?: unknown;
  txtContent?: string | null;
  pdfUrl?: string | null;
  detectedProviderName?: string | null;
  matchedProviderId?: string | null;
  matchedProviderName?: string | null;
  claimValidationPayload?: unknown;
  claimValidationPayloadReady?: boolean;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  processingTimeMs?: number;
}

interface ProviderResolution {
  id: string;
  name: string;
  clientId: string | null;
}

const ACTIVE_OCR_STATUSES = new Set(["OCR_PROCESSING", "PENDING", "SCORING"]);

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isCompletedStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === "COMPLETED" || normalized === "DONE" || normalized === "SUCCESS" || normalized === "SUCCEEDED";
}

function isFailedStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === "FAILED" || normalized === "ERROR" || normalized === "CANCELED" || normalized === "CANCELLED";
}

function normalizeProviderName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(pt|rs|rsu|rsia|rumah|sakit|hospital|clinic|klinik)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokenOverlapScore(source: string, candidate: string): number {
  const sourceTokens = new Set(normalizeProviderName(source).split(" ").filter(Boolean));
  const candidateTokens = new Set(normalizeProviderName(candidate).split(" ").filter(Boolean));

  if (sourceTokens.size === 0 || candidateTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(sourceTokens.size, candidateTokens.size);
}

export function getProviderNameFromOcrItems(ocrItems: Array<{ field: string; value: string; correctedValue?: string }>): string | null {
  const providerItem = ocrItems.find((item) => item.field === "provider_name");
  const value = providerItem?.correctedValue ?? providerItem?.value;
  return value && value.trim().length > 0 ? value.trim() : null;
}

function isOcrItem(value: unknown): value is OcrItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.field === "string" &&
    typeof record.label === "string" &&
    typeof record.value === "string" &&
    typeof record.valueType === "string" &&
    (record.rawValue === null || ["string", "number", "boolean"].includes(typeof record.rawValue)) &&
    (record.correctedValue === undefined || typeof record.correctedValue === "string")
  );
}

function parseStoredOcrItems(value: unknown): OcrItem[] {
  return Array.isArray(value) ? value.filter(isOcrItem) : [];
}

export async function resolveProviderFromOcrName(providerName: string | null, clientId: string | null): Promise<ProviderResolution | null> {
  if (!providerName) return null;

  const where: Prisma.ProviderWhereInput = { isActive: true };
  if (clientId) {
    where.clientId = clientId;
  }

  const providers = await prisma.provider.findMany({
    where,
    select: {
      id: true,
      name: true,
      clientId: true,
    },
  });

  const normalizedOcrName = normalizeProviderName(providerName);
  const exactMatch = providers.find((provider) => normalizeProviderName(provider.name) === normalizedOcrName);
  if (exactMatch) return exactMatch;

  const containsMatch = providers.find((provider) => {
    const normalizedProvider = normalizeProviderName(provider.name);
    return normalizedProvider.includes(normalizedOcrName) || normalizedOcrName.includes(normalizedProvider);
  });
  if (containsMatch) return containsMatch;

  let bestMatch: ProviderResolution | null = null;
  let bestScore = 0;

  for (const provider of providers) {
    const score = getTokenOverlapScore(providerName, provider.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = provider;
    }
  }

  return bestScore >= 0.67 ? bestMatch : null;
}

/**
 * Resolve provider from an OCR items array by extracting the provider_name field
 * and delegating to resolveProviderFromOcrName for fuzzy matching.
 */
export async function resolveProviderFromOcrItems(
  ocrItems: Array<{ field: string; value: string; correctedValue?: string }>,
  clientId: string | null,
): Promise<ProviderResolution | null> {
  const providerName = getProviderNameFromOcrItems(ocrItems);
  if (!providerName) return null;
  return resolveProviderFromOcrName(providerName, clientId);
}

export function isActiveOcrStatus(status: string): boolean {
  return ACTIVE_OCR_STATUSES.has(status);
}

export async function buildStoredOcrJobResponse(ocrJob: {
  id: string;
  clientId: string | null;
  providerId: string | null;
  pdfUrl: string;
  pdfStoragePath: string;
  status: string;
  snaptextStatus: string;
  matchScore: number | null;
  scoringDetails: unknown;
  ocrItems: unknown;
  txtItems: unknown;
  ocrRawResult: unknown;
  txtContent: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<OcrJobProcessingResult> {
  const storedOcrItems = parseStoredOcrItems(ocrJob.ocrItems);
  const providerName = getProviderNameFromOcrItems(storedOcrItems);
  const claimValidationPayload = storedOcrItems.length > 0
    ? buildClaimValidationPayloadFromOcr({
        ocrJobId: ocrJob.id,
        clientId: ocrJob.clientId,
        providerId: ocrJob.providerId,
        providerName,
        pdfUrl: ocrJob.pdfUrl,
        pdfStoragePath: ocrJob.pdfStoragePath,
        ocrItems: storedOcrItems,
        ocrRawResult: ocrJob.ocrRawResult,
      })
    : undefined;



  return {
    status: ocrJob.status,
    snaptextStatus: ocrJob.snaptextStatus,
    terminal: !isActiveOcrStatus(ocrJob.status),
    retryable: false,
    matchScore: ocrJob.matchScore,
    scoringDetails: ocrJob.scoringDetails,
    ocrItems: ocrJob.ocrItems,
    txtItems: ocrJob.txtItems,
    ocrRawResult: ocrJob.ocrRawResult,
    txtContent: ocrJob.txtContent,
    pdfUrl: ocrJob.pdfUrl,
    detectedProviderName: providerName,
    matchedProviderId: ocrJob.providerId,
    matchedProviderName: null,
    claimValidationPayload,
    claimValidationPayloadReady: ocrJob.matchScore === 100 && Boolean(ocrJob.providerId),
    createdAt: ocrJob.createdAt.toISOString(),
    updatedAt: ocrJob.updatedAt.toISOString(),
    processingTimeMs: Math.max(0, ocrJob.updatedAt.getTime() - ocrJob.createdAt.getTime()),
  };
}

export async function processOcrJobSnaptextStatus(ocrJobId: string): Promise<OcrJobProcessingResult> {
  const ocrJob = await prisma.ocrJob.findUnique({ where: { id: ocrJobId } });

  if (!ocrJob) {
    return {
      status: "NOT_FOUND",
      snaptextStatus: "NOT_FOUND",
      terminal: true,
      retryable: false,
      error: "Job OCR tidak ditemukan.",
    };
  }

  if (!isActiveOcrStatus(ocrJob.status)) {
    return await buildStoredOcrJobResponse(ocrJob);
  }

  if (!ocrJob.snaptextJobId) {
    return {
      status: ocrJob.status,
      snaptextStatus: ocrJob.snaptextStatus,
      terminal: false,
      retryable: false,
      error: "Job OCR belum memiliki ID SnapText.",
    };
  }

  let snaptextStatus: Awaited<ReturnType<typeof pollSnaptextJob>>;
  try {
    snaptextStatus = await pollSnaptextJob(ocrJob.snaptextJobId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal mengecek status SnapText.";
    await prisma.ocrJob.update({
      where: { id: ocrJob.id },
      data: {
        errorMessage: `Polling SnapText sementara gagal: ${message}`,
      },
    });

    return {
      status: ocrJob.status,
      snaptextStatus: ocrJob.snaptextStatus,
      terminal: false,
      retryable: true,
      error: message,
    };
  }

  if (isCompletedStatus(snaptextStatus.status) && snaptextStatus.result !== undefined) {
    const sanitizedOcrRawResult = sanitizeSnaptextOcrResult(snaptextStatus.result);
    const ocrItems = parseOcrResult(sanitizedOcrRawResult);
    const txtItems = parseTxtGroundTruth(ocrJob.txtContent ?? "");
    const scoringResult = scoreOcrAgainstTxt(ocrItems, txtItems);
    const detectedProviderName = getProviderNameFromOcrItems(ocrItems);
    const matchedProvider = await resolveProviderFromOcrName(detectedProviderName, ocrJob.clientId);
    const payloadClientId = matchedProvider?.clientId ?? ocrJob.clientId;
    const claimValidationPayload = buildClaimValidationPayloadFromOcr({
      ocrJobId: ocrJob.id,
      clientId: payloadClientId,
      providerId: matchedProvider?.id ?? null,
      providerName: matchedProvider?.name ?? detectedProviderName,
      pdfUrl: ocrJob.pdfUrl,
      pdfStoragePath: ocrJob.pdfStoragePath,
      ocrItems,
      ocrRawResult: sanitizedOcrRawResult,
    });
    const nextStatus = scoringResult.score === 100 ? "APPROVED" : "REVIEW_NEEDED";

    await prisma.ocrJob.update({
      where: { id: ocrJob.id },
      data: {
        clientId: payloadClientId,
        providerId: matchedProvider?.id ?? null,
        snaptextStatus: "COMPLETED",
        ocrRawResult: toJsonValue(sanitizedOcrRawResult),
        ocrItems: toJsonValue(ocrItems),
        txtItems: toJsonValue(txtItems),
        matchScore: scoringResult.score,
        scoringDetails: toJsonValue(scoringResult.details),
        status: nextStatus,
        errorMessage: txtItems.length === 0 ? "TXT ground truth tidak memiliki field schema yang dapat dibandingkan." : null,
      },
    });

    return {
      status: nextStatus,
      snaptextStatus: "COMPLETED",
      terminal: true,
      retryable: false,
      matchScore: scoringResult.score,
      scoringDetails: scoringResult.details,
      ocrItems,
      txtItems,
      ocrRawResult: sanitizedOcrRawResult,
      txtContent: ocrJob.txtContent,
      pdfUrl: ocrJob.pdfUrl,
      detectedProviderName,
      matchedProviderId: matchedProvider?.id ?? null,
      matchedProviderName: matchedProvider?.name ?? null,
      claimValidationPayload,
      claimValidationPayloadReady: scoringResult.score === 100 && Boolean(matchedProvider?.id),
    };
  }

  if (isFailedStatus(snaptextStatus.status)) {
    await prisma.ocrJob.update({
      where: { id: ocrJob.id },
      data: {
        snaptextStatus: "FAILED",
        status: "FAILED",
        errorMessage: "SnapText OCR job gagal diproses.",
      },
    });

    return {
      status: "FAILED",
      snaptextStatus: "FAILED",
      terminal: true,
      retryable: false,
      error: "SnapText OCR job gagal diproses.",
    };
  }

  const normalizedSnaptextStatus = snaptextStatus.status.toUpperCase();
  await prisma.ocrJob.update({
    where: { id: ocrJob.id },
    data: {
      snaptextStatus: normalizedSnaptextStatus,
      status: "OCR_PROCESSING",
      errorMessage: null,
    },
  });

  return {
    status: "OCR_PROCESSING",
    snaptextStatus: normalizedSnaptextStatus,
    terminal: false,
    retryable: true,
  };
}
