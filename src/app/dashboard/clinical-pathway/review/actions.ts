"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { applyClaimDisplayMetadataToJob } from "@/lib/claim-display";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";
import {
  buildHitlPacket,
  getReviewStatusFromDecision,
  maskPatientName,
  type HitlPacket,
  type ReviewDecisionRecord,
  type ReviewDecisionValue,
  type ReviewStatusValue,
} from "@/lib/hitl";

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "CLIENT_ADMIN", "CLIENT_USER"]);

const decisionSchema = z.object({
  jobId: z.string().uuid(),
  decision: z.enum(["APPROVE", "APPROVE_WITH_ADJUSTMENT", "REJECT", "REQUEST_DOCUMENTS", "ESCALATE_MEDICAL_ADVISOR"]),
  payableAmount: z.coerce.number().min(0).optional(),
  excessAmount: z.coerce.number().min(0).optional(),
  reasonCode: z.string().trim().max(80).optional(),
  note: z.string().trim().max(2000).optional(),
});

interface ReviewDecisionDbRecord {
  id: string;
  decision: string;
  reviewStatus: string;
  payableAmount: number | null;
  excessAmount: number | null;
  reasonCode: string | null;
  note: string | null;
  previousReviewStatus: string | null;
  nextReviewStatus: string;
  createdAt: Date;
  reviewer: {
    name: string | null;
    email: string;
  } | null;
}

interface ReviewQueueJobDbRecord {
  id: string;
  clientId: string | null;
  status: string;
  inputPayload: Prisma.JsonValue;
  outputResult: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  completedAt: Date | null;
  provider: { name: string } | null;
  reviewDecisions: ReviewDecisionDbRecord[];
}

export interface ReviewQueueItem {
  id: string;
  claimId: string;
  patientName: string;
  providerName: string;
  createdAt: string;
  completedAt: string | null;
  validationStatus: string;
  reviewStatus: ReviewStatusValue | string;
  latestDecision: string | null;
  score: number | null;
  totalClaimAmount: number;
  policyExcessAmount: number;
  findingCount: number;
  topFlags: string[];
  recommendedAction: ReviewDecisionValue;
  slaAgeHours: number;
}

export interface ReviewQueueSummary {
  open: number;
  waitingDocuments: number;
  escalated: number;
  decided: number;
  totalPolicyExcess: number;
}

export interface ReviewQueueData {
  items: ReviewQueueItem[];
  summary: ReviewQueueSummary;
}

export interface SubmitReviewDecisionResult {
  success: boolean;
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getClaimId(inputPayload: unknown, jobId: string): string {
  const input = asRecord(inputPayload);
  return stringValue(input.claimId) || jobId.slice(0, 8).toUpperCase();
}

function getPatientDisplay(inputPayload: unknown): string {
  const input = asRecord(inputPayload);
  const patient = asRecord(input.patient);
  return maskPatientName(patient.name);
}

function getScore(outputResult: unknown): number | null {
  const output = asRecord(outputResult);
  return numberOrNull(output.overallScore ?? output.validationScore);
}

function getValidationStatus(outputResult: unknown, jobStatus: string): string {
  const output = asRecord(outputResult);
  return stringValue(output.status) || jobStatus;
}

function serializeDecision(decision: ReviewDecisionDbRecord): ReviewDecisionRecord {
  return {
    id: decision.id,
    decision: decision.decision,
    reviewStatus: decision.reviewStatus,
    payableAmount: decision.payableAmount,
    excessAmount: decision.excessAmount,
    reasonCode: decision.reasonCode,
    note: decision.note,
    previousReviewStatus: decision.previousReviewStatus,
    nextReviewStatus: decision.nextReviewStatus,
    createdAt: decision.createdAt.toISOString(),
    reviewer: decision.reviewer,
  };
}

function getReviewStatus(decisions: ReviewDecisionDbRecord[]): ReviewStatusValue | string {
  return decisions[0]?.nextReviewStatus || "OPEN";
}

function isReviewCandidate(job: ReviewQueueJobDbRecord, packet: HitlPacket): boolean {
  const output = asRecord(job.outputResult);
  const validationStatus = stringValue(output.status);
  const policyStatus = stringValue(asRecord(output.policyValidation).status);
  const reviewStatus = getReviewStatus(job.reviewDecisions);

  return reviewStatus !== "DECIDED"
    || validationStatus === "WARNING"
    || validationStatus === "REVIEW_NEEDED"
    || (policyStatus !== "" && policyStatus !== "PASS")
    || packet.findings.length > 0;
}

function toQueueItem(job: ReviewQueueJobDbRecord): ReviewQueueItem {
  const displayJob = applyClaimDisplayMetadataToJob(job);
  const inputPayload = displayJob.inputPayload;
  const outputResult = displayJob.outputResult;
  const packet = buildHitlPacket(inputPayload, outputResult);
  const latestDecision = job.reviewDecisions[0] || null;
  const completedAt = job.completedAt || job.createdAt;
  const slaAgeHours = Math.max(0, Math.floor((Date.now() - completedAt.getTime()) / 3_600_000));

  return {
    id: job.id,
    claimId: getClaimId(inputPayload, job.id),
    patientName: getPatientDisplay(inputPayload),
    providerName: job.provider?.name || "-",
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() || null,
    validationStatus: getValidationStatus(outputResult, job.status),
    reviewStatus: latestDecision?.nextReviewStatus || "OPEN",
    latestDecision: latestDecision?.decision || null,
    score: getScore(outputResult),
    totalClaimAmount: packet.financialImpact.claimAmount,
    policyExcessAmount: packet.financialImpact.policyExcessAmount,
    findingCount: packet.findings.length,
    topFlags: packet.findings.slice(0, 3).map((finding) => finding.message),
    recommendedAction: packet.recommendedAction,
    slaAgeHours,
  };
}

function canReview(role: string): boolean {
  return REVIEW_ROLES.has(role);
}

async function getScopedJob(jobId: string) {
  const user = await getAuthenticatedUser();
  if (!user || !canReview(user.role)) return { user, job: null };

  const job = await prisma.claimJob.findUnique({
    where: { id: jobId },
    include: {
      reviewDecisions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { reviewer: { select: { name: true, email: true } } },
      },
    },
  });

  if (!job) return { user, job: null };
  if (!isPlatformAdminRole(user.role) && job.clientId !== user.clientId) return { user, job: null };

  return { user, job };
}

export async function getReviewQueueData(): Promise<ReviewQueueData> {
  const user = await getAuthenticatedUser();
  if (!user || !canReview(user.role)) {
    return {
      items: [],
      summary: { open: 0, waitingDocuments: 0, escalated: 0, decided: 0, totalPolicyExcess: 0 },
    };
  }

  const where: Prisma.ClaimJobWhereInput = { jobType: "CLAIM_VALIDATION", status: "COMPLETED" };
  if (!isPlatformAdminRole(user.role)) {
    if (!user.clientId) {
      return {
        items: [],
        summary: { open: 0, waitingDocuments: 0, escalated: 0, decided: 0, totalPolicyExcess: 0 },
      };
    }
    where.clientId = user.clientId;
  }

  const jobs = await prisma.claimJob.findMany({
    where,
    include: {
      provider: { select: { name: true } },
      reviewDecisions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { reviewer: { select: { name: true, email: true } } },
      },
    },
    orderBy: { completedAt: "desc" },
    take: 150,
  });

  const items = jobs
    .filter((job) => isReviewCandidate(job, buildHitlPacket(applyClaimDisplayMetadataToJob(job).inputPayload, job.outputResult)))
    .map(toQueueItem);

  const summary = items.reduce<ReviewQueueSummary>((total, item) => {
    if (item.reviewStatus === "WAITING_DOCUMENTS") total.waitingDocuments += 1;
    else if (item.reviewStatus === "ESCALATED") total.escalated += 1;
    else if (item.reviewStatus === "DECIDED") total.decided += 1;
    else total.open += 1;
    total.totalPolicyExcess += item.policyExcessAmount;
    return total;
  }, { open: 0, waitingDocuments: 0, escalated: 0, decided: 0, totalPolicyExcess: 0 });

  return { items, summary };
}

export async function submitReviewDecision(formData: FormData): Promise<SubmitReviewDecisionResult> {
  const parsed = decisionSchema.safeParse({
    jobId: formData.get("jobId"),
    decision: formData.get("decision"),
    payableAmount: formData.get("payableAmount") || undefined,
    excessAmount: formData.get("excessAmount") || undefined,
    reasonCode: formData.get("reasonCode") || undefined,
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { success: false, error: "Input keputusan reviewer tidak valid." };
  }

  const { user, job } = await getScopedJob(parsed.data.jobId);
  if (!user || !job) {
    return { success: false, error: "Klaim tidak ditemukan atau Anda tidak memiliki akses review." };
  }

  const nextReviewStatus = getReviewStatusFromDecision(parsed.data.decision);
  const previousReviewStatus = job.reviewDecisions[0]?.nextReviewStatus || "OPEN";
  const hitlPacket = buildHitlPacket(job.inputPayload, job.outputResult);

  await prisma.claimReviewDecision.create({
    data: {
      jobId: job.id,
      clientId: job.clientId,
      reviewerId: user.id,
      decision: parsed.data.decision,
      reviewStatus: nextReviewStatus,
      payableAmount: parsed.data.payableAmount,
      excessAmount: parsed.data.excessAmount,
      reasonCode: parsed.data.reasonCode || null,
      note: parsed.data.note || null,
      previousReviewStatus,
      nextReviewStatus,
      hitlPacket: hitlPacket as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/dashboard/clinical-pathway/review");
  revalidatePath(`/dashboard/clinical-pathway/${job.id}`);
  return { success: true };
}

export async function getReviewDecisionsForJob(jobId: string): Promise<ReviewDecisionRecord[]> {
  const { job } = await getScopedJob(jobId);
  if (!job) return [];

  const decisions = await prisma.claimReviewDecision.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { name: true, email: true } } },
    take: 20,
  });

  return decisions.map(serializeDecision);
}
