import type { ClaimValidationInput } from "@/lib/ai/types";
import prisma from "@/lib/db";

export interface OcrMasterLookupCandidate {
  id: string;
  code?: string | null;
  name: string;
  category?: string | null;
  referencePrice: number;
  matchType: "EXACT_CODE" | "EXACT_NAME" | "TOKEN";
  score: number;
}

export interface OcrMasterLookupItem {
  sourceType: "PROCEDURE" | "MEDICATION";
  sourceIndex: number;
  sourceName: string;
  sourceCode?: string | null;
  claimedTotal: number;
  status: "MATCHED" | "CANDIDATE" | "NOT_FOUND" | "SKIPPED";
  selectedCandidate?: OcrMasterLookupCandidate;
  candidates: OcrMasterLookupCandidate[];
  note: string;
}

export interface OcrMasterDataLookupResult {
  generatedAt: string;
  providerId: string | null;
  summary: {
    procedureCount: number;
    medicationCount: number;
    matchedProcedureCount: number;
    matchedMedicationCount: number;
    candidateProcedureCount: number;
    candidateMedicationCount: number;
    notFoundProcedureCount: number;
    notFoundMedicationCount: number;
  };
  procedures: OcrMasterLookupItem[];
  medications: OcrMasterLookupItem[];
}

interface ProcedureCandidateRecord {
  id: string;
  procedureCode: string;
  serviceCode: string | null;
  procedureName: string;
  category: string;
  maxPrice: number;
}

interface MedicalItemCandidateRecord {
  id: string;
  itemName: string;
  itemGenericName: string | null;
  itemGroup: string | null;
  itemTypeCode: string | null;
  marketPriceMax: number;
  maxReferencePrice: number | null;
  hetPrice: number | null;
  fixPrice: number | null;
}

type ClaimProcedure = ClaimValidationInput["procedures"][number];
type ClaimMedication = ClaimValidationInput["medications"][number];

const MAX_LOOKUP_ITEMS = 120;
const MAX_CANDIDATES = 5;
const SEARCH_STOPWORDS = new Set([
  "and", "or", "the", "of", "dan", "yang", "dengan", "untuk", "include", "reading",
  "tab", "tablet", "inj", "inf", "cap", "capsule", "ml", "mg", "mcg", "gram", "gr", "pcs", "unit",
  "floor", "ward", "pharmacy", "inpatient", "outpatient", "emergency", "drugs",
]);

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function tokenize(value: unknown): string[] {
  return Array.from(new Set(normalizeText(value).split(" ").filter((token) => {
    if (!token || SEARCH_STOPWORDS.has(token)) return false;
    if (/^\d+(?:\.\d+)?$/.test(token)) return false;
    return token.length >= 3;
  }))).slice(0, 6);
}

function getTokenScore(source: string, candidate: string): number {
  const sourceTokens = tokenize(source);
  const candidateTokens = new Set(tokenize(candidate));
  if (sourceTokens.length === 0 || candidateTokens.size === 0) return 0;

  const overlap = sourceTokens.filter((token) => candidateTokens.has(token)).length;
  return Math.round((overlap / Math.max(sourceTokens.length, candidateTokens.size)) * 100);
}

function getBestMedicalReferencePrice(candidate: MedicalItemCandidateRecord): number {
  const prices = [candidate.maxReferencePrice, candidate.hetPrice, candidate.marketPriceMax, candidate.fixPrice];
  const meaningful = prices.find((price): price is number => typeof price === "number" && Number.isFinite(price) && price >= 100);
  return meaningful ?? 0;
}

function buildProcedureCandidate(candidate: ProcedureCandidateRecord, matchType: OcrMasterLookupCandidate["matchType"], score: number): OcrMasterLookupCandidate {
  return {
    id: candidate.id,
    code: candidate.procedureCode || candidate.serviceCode,
    name: candidate.procedureName,
    category: candidate.category,
    referencePrice: candidate.maxPrice,
    matchType,
    score,
  };
}

function buildMedicalCandidate(candidate: MedicalItemCandidateRecord, matchType: OcrMasterLookupCandidate["matchType"], score: number): OcrMasterLookupCandidate {
  return {
    id: candidate.id,
    code: candidate.itemTypeCode,
    name: candidate.itemName,
    category: candidate.itemGroup,
    referencePrice: getBestMedicalReferencePrice(candidate),
    matchType,
    score,
  };
}

async function findProcedureCandidates(procedure: ClaimProcedure, providerId: string | null): Promise<OcrMasterLookupCandidate[]> {
  if (!providerId) return [];

  const rawCode = String(procedure.code ?? "").trim();
  const sourceName = procedure.name;
  const exactCode = normalizeCode(rawCode);

  if (exactCode) {
    const codeMatches = await prisma.tariffEntry.findMany({
      where: {
        providerId,
        isActive: true,
        OR: [
          { procedureCode: { equals: rawCode, mode: "insensitive" } },
          { serviceCode: { equals: rawCode, mode: "insensitive" } },
        ],
      },
      select: { id: true, procedureCode: true, serviceCode: true, procedureName: true, category: true, maxPrice: true },
      orderBy: { maxPrice: "desc" },
      take: MAX_CANDIDATES,
    });

    if (codeMatches.length > 0) return codeMatches.map((candidate) => buildProcedureCandidate(candidate, "EXACT_CODE", 100));
  }

  const exactNameMatches = await prisma.tariffEntry.findMany({
    where: {
      providerId,
      isActive: true,
      procedureName: { equals: sourceName, mode: "insensitive" },
    },
    select: { id: true, procedureCode: true, serviceCode: true, procedureName: true, category: true, maxPrice: true },
    orderBy: { maxPrice: "desc" },
    take: MAX_CANDIDATES,
  });

  if (exactNameMatches.length > 0) return exactNameMatches.map((candidate) => buildProcedureCandidate(candidate, "EXACT_NAME", 95));

  const tokens = tokenize(sourceName).slice(0, 4);
  if (tokens.length === 0) return [];

  const tokenMatches = await prisma.tariffEntry.findMany({
    where: {
      providerId,
      isActive: true,
      OR: tokens.map((token) => ({ procedureName: { contains: token, mode: "insensitive" as const } })),
    },
    select: { id: true, procedureCode: true, serviceCode: true, procedureName: true, category: true, maxPrice: true },
    orderBy: { maxPrice: "desc" },
    take: 20,
  });

  return tokenMatches
    .map((candidate) => buildProcedureCandidate(candidate, "TOKEN", getTokenScore(sourceName, candidate.procedureName)))
    .filter((candidate) => candidate.score >= 35)
    .sort((a, b) => b.score - a.score || b.referencePrice - a.referencePrice)
    .slice(0, MAX_CANDIDATES);
}

async function findMedicalCandidates(medication: ClaimMedication): Promise<OcrMasterLookupCandidate[]> {
  const sourceName = `${medication.name} ${medication.genericName ?? ""}`.trim();

  const exactNameMatches = await prisma.medicalItemPriceMaster.findMany({
    where: {
      expiresAt: { gt: new Date() },
      OR: [
        { itemName: { equals: medication.name, mode: "insensitive" } },
        ...(medication.genericName ? [{ itemGenericName: { equals: medication.genericName, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      id: true,
      itemName: true,
      itemGenericName: true,
      itemGroup: true,
      itemTypeCode: true,
      marketPriceMax: true,
      maxReferencePrice: true,
      hetPrice: true,
      fixPrice: true,
    },
    orderBy: [{ fetchedAt: "desc" }, { createdAt: "desc" }],
    take: MAX_CANDIDATES,
  });

  if (exactNameMatches.length > 0) return exactNameMatches.map((candidate) => buildMedicalCandidate(candidate, "EXACT_NAME", 95));

  const tokens = tokenize(sourceName).slice(0, 5);
  if (tokens.length === 0) return [];

  const tokenMatches = await prisma.medicalItemPriceMaster.findMany({
    where: {
      expiresAt: { gt: new Date() },
      OR: tokens.flatMap((token) => [
        { itemName: { contains: token, mode: "insensitive" as const } },
        { itemGenericName: { contains: token, mode: "insensitive" as const } },
      ]),
    },
    select: {
      id: true,
      itemName: true,
      itemGenericName: true,
      itemGroup: true,
      itemTypeCode: true,
      marketPriceMax: true,
      maxReferencePrice: true,
      hetPrice: true,
      fixPrice: true,
    },
    orderBy: [{ fetchedAt: "desc" }, { createdAt: "desc" }],
    take: 30,
  });

  return tokenMatches
    .map((candidate) => buildMedicalCandidate(candidate, "TOKEN", Math.max(getTokenScore(medication.name, candidate.itemName), getTokenScore(medication.genericName ?? "", candidate.itemGenericName ?? ""))))
    .filter((candidate) => candidate.score >= 35)
    .sort((a, b) => b.score - a.score || b.referencePrice - a.referencePrice)
    .slice(0, MAX_CANDIDATES);
}

function buildLookupItem(
  sourceType: OcrMasterLookupItem["sourceType"],
  sourceIndex: number,
  sourceName: string,
  sourceCode: string | null | undefined,
  claimedTotal: number,
  candidates: OcrMasterLookupCandidate[],
): OcrMasterLookupItem {
  const selectedCandidate = candidates[0];
  const status: OcrMasterLookupItem["status"] = !selectedCandidate
    ? "NOT_FOUND"
    : selectedCandidate.matchType === "TOKEN"
      ? "CANDIDATE"
      : "MATCHED";

  return {
    sourceType,
    sourceIndex,
    sourceName,
    sourceCode,
    claimedTotal,
    status,
    selectedCandidate,
    candidates,
    note: status === "MATCHED"
      ? "Ditemukan kecocokan kuat di master data."
      : status === "CANDIDATE"
        ? "Ditemukan kandidat master data berbasis token; perlu konfirmasi reviewer."
        : "Tidak ditemukan kandidat master data lokal.",
  };
}

export async function buildOcrMasterDataLookup(payload: ClaimValidationInput): Promise<OcrMasterDataLookupResult> {
  const providerId = payload.providerId || null;
  const procedureInputs = payload.procedures.slice(0, MAX_LOOKUP_ITEMS);
  const medicationInputs = payload.medications.slice(0, MAX_LOOKUP_ITEMS);

  const [procedures, medications] = await Promise.all([
    Promise.all(procedureInputs.map(async (procedure, index) => {
      const candidates = await findProcedureCandidates(procedure, providerId);
      return buildLookupItem("PROCEDURE", index, procedure.name, procedure.code, procedure.totalPrice, candidates);
    })),
    Promise.all(medicationInputs.map(async (medication, index) => {
      const candidates = await findMedicalCandidates(medication);
      return buildLookupItem("MEDICATION", index, medication.name, null, medication.totalPrice, candidates);
    })),
  ]);

  const countByStatus = (items: OcrMasterLookupItem[], status: OcrMasterLookupItem["status"]): number => items.filter((item) => item.status === status).length;

  return {
    generatedAt: new Date().toISOString(),
    providerId,
    summary: {
      procedureCount: procedureInputs.length,
      medicationCount: medicationInputs.length,
      matchedProcedureCount: countByStatus(procedures, "MATCHED"),
      matchedMedicationCount: countByStatus(medications, "MATCHED"),
      candidateProcedureCount: countByStatus(procedures, "CANDIDATE"),
      candidateMedicationCount: countByStatus(medications, "CANDIDATE"),
      notFoundProcedureCount: countByStatus(procedures, "NOT_FOUND"),
      notFoundMedicationCount: countByStatus(medications, "NOT_FOUND"),
    },
    procedures,
    medications,
  };
}
