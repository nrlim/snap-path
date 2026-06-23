import prisma from '@/lib/db';
import { DrugPriceCheckInput, DrugPriceCheckOutput } from '../types';
import { getAIGateway } from '../gateway';

const MASTER_DATA_SOURCE_TAG = 'master_data';
const MASTER_MATCH_MIN_SCORE = 12;
const AI_RESOLVER_BATCH_SIZE = 5;
const AI_RESOLVER_CANDIDATE_LIMIT = 20;
const COVERED_MEDICAL_ITEM_TYPE_CODES = new Set(['medicine', 'supplement', 'herbal', 'kuasi', 'vaccine', 'paket_obat', 'device', 'pkrt']);
const COVERED_MEDICAL_ITEM_GROUPS = new Set(['farmasi', 'alkes']);
const DRUG_SEARCH_STOPWORDS = new Set([
  'inj', 'injeksi', 'inf', 'infus', 'tablet', 'tab', 'kaps', 'kap', 'capsule', 'cap',
  'amp', 'ampul', 'vial', 'vl', 'sirup', 'syrup', 'syr', 'susp', 'cream', 'krim',
  'salep', 'gel', 'strip', 'pcs', 'unit', 'botol', 'btl', 'ml', 'mg', 'mcg', 'g', 'gram', 'gr',
  'iu', 'ui', 'meq', 'persen', 'percent', 'oral', 'iv', 'im', 'sc', 'supp', 'suppositoria',
]);
const DRUG_SHORT_NAME_TOKENS = new Set(['rl', 'ns', 'd5', 'd10', 'kcl', 'nacl']);

function getJsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchText(value: unknown): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

function getLexicalDrugTokens(value: unknown): string[] {
  return Array.from(new Set(tokenizeSearchText(value).filter((token) => {
    if (DRUG_SEARCH_STOPWORDS.has(token)) return false;
    if (/^\d+(?:\.\d+)?$/.test(token)) return false;
    if (/^[a-z]+\d+$/.test(token)) return DRUG_SHORT_NAME_TOKENS.has(token);
    return token.length >= 3 || DRUG_SHORT_NAME_TOKENS.has(token);
  })));
}

function normalizeDrugProductText(value: unknown): string {
  return tokenizeSearchText(value)
    .filter((token) => !DRUG_SEARCH_STOPWORDS.has(token))
    .join(' ');
}

function isMeaningfulReferencePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 100;
}

function getBestReferencePrice(...prices: unknown[]): number {
  const firstMeaningfulPrice = prices.find(isMeaningfulReferencePrice);
  return firstMeaningfulPrice ?? 0;
}

function getSearchTokens(med: any): string[] {
  const lexicalTokens = [
    ...getLexicalDrugTokens(med.name),
    ...getLexicalDrugTokens(med.genericName),
  ];
  return Array.from(new Set(lexicalTokens)).slice(0, 6);
}

function hasLexicalDrugTokenOverlap(med: any, candidate: { itemName: string; itemGenericName: string | null }) {
  const medNameTokens = getLexicalDrugTokens(med.name);
  const medGenericTokens = getLexicalDrugTokens(med.genericName);
  const candidateNameTokens = getLexicalDrugTokens(candidate.itemName);
  const candidateGenericTokens = getLexicalDrugTokens(candidate.itemGenericName || '');
  const candidateAllTokens = new Set([...candidateNameTokens, ...candidateGenericTokens]);

  return [...medNameTokens, ...medGenericTokens].some((token) => candidateAllTokens.has(token));
}

function scoreMasterDrugCandidate(med: any, candidate: { itemName: string; itemGenericName: string | null; itemTypeCode: string | null; itemGroup: string | null; sources: unknown }) {
  const sources = getJsonStringArray(candidate.sources);
  if (!sources.some((source) => source.includes(MASTER_DATA_SOURCE_TAG))) return -1;

  const medName = normalizeDrugProductText(med.name);
  const medGeneric = normalizeDrugProductText(med.genericName || '');
  const medText = `${medName} ${medGeneric}`.trim();
  const candidateName = normalizeDrugProductText(candidate.itemName);
  const candidateGeneric = normalizeDrugProductText(candidate.itemGenericName || '');
  const candidateText = `${candidateName} ${candidateGeneric}`.trim();
  const tokens = getSearchTokens(med);
  const hasLexicalOverlap = hasLexicalDrugTokenOverlap(med, candidate);

  // Never resolve a drug using dosage/strength/package tokens only. Example:
  // "PAMOL 500 MG TABLET" must not match "PRIMEXA 500" just because both contain 500.
  if (!hasLexicalOverlap && medName !== candidateName && (!medGeneric || medGeneric !== candidateGeneric)) return -1;

  let score = 0;
  if (candidateName === medName) score += 120;
  if (medGeneric && candidateGeneric && candidateGeneric === medGeneric) score += 90;
  if (medText && (candidateText.includes(medText) || medText.includes(candidateName))) score += 45;
  if (normalizeSearchText(candidate.itemGroup || '') === 'farmasi') score += 6;
  if (normalizeSearchText(candidate.itemTypeCode || '') === 'medicine') score += 6;
  for (const token of tokens) {
    if (candidateName.split(' ').includes(token)) score += 16;
    if (candidateGeneric.split(' ').includes(token)) score += 12;
  }

  return score;
}

async function getMedicalItemCandidates(med: any, now: Date, take = 50) {
  const tokens = getSearchTokens(med);
  if (tokens.length === 0) return [];

  return prisma.medicalItemPriceMaster.findMany({
    where: {
      expiresAt: { gt: now },
      OR: tokens.flatMap((token) => [
        { itemName: { contains: token, mode: 'insensitive' as const } },
        { itemGenericName: { contains: token, mode: 'insensitive' as const } },
      ]),
    },
    orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
    take,
  });
}

async function getRankedMedicalItemCandidates(med: any, now: Date, take = 50) {
  const candidates = await getMedicalItemCandidates(med, now, take);
  return candidates
    .map((candidate) => ({ candidate, score: scoreMasterDrugCandidate(med, candidate) }))
    .filter((item) => item.score >= MASTER_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

function isDeterministicMasterMatch(rankedCandidates: Awaited<ReturnType<typeof getRankedMedicalItemCandidates>>) {
  const best = rankedCandidates[0];
  if (!best) return false;

  const secondBestScore = rankedCandidates[1]?.score ?? 0;
  const scoreMargin = best.score - secondBestScore;

  // Exact/near-exact brand or generic matches are safe without AI. We avoid
  // auto-picking weak multi-candidate matches, so AI can resolve ambiguity.
  return best.score >= 100 || (best.score >= 40 && scoreMargin >= 25);
}

async function findMedicalMasterItemPrice(med: any, now: Date) {
  const rankedCandidates = await getRankedMedicalItemCandidates(med, now, 50);
  if (!isDeterministicMasterMatch(rankedCandidates)) return null;

  return buildFinalPriceFromMasterItem(rankedCandidates[0].candidate);
}

function buildFinalPriceFromMasterItem(best: Awaited<ReturnType<typeof getMedicalItemCandidates>>[number]) {
  const sources = getJsonStringArray(best.sources);
  const itemGroup = normalizeSearchText(best.itemGroup || '');
  const itemTypeCode = normalizeSearchText(best.itemTypeCode || '');
  const isCoveredMedicalItem = COVERED_MEDICAL_ITEM_GROUPS.has(itemGroup) || COVERED_MEDICAL_ITEM_TYPE_CODES.has(itemTypeCode);
  const bestReferencePrice = getBestReferencePrice(
    best.maxReferencePrice,
    best.hetPrice,
    best.marketPriceMax,
    best.fixPrice,
  );

  return {
    marketPriceMax: isCoveredMedicalItem ? bestReferencePrice : 0,
    sources: isCoveredMedicalItem ? sources : ['non_medication', ...sources],
    resolvedProductName: best.itemName,
    dosageForm: best.itemTypeName || best.itemTypeCode || undefined,
    unitBasis: best.itemGroup || undefined,
    fixPrice: best.fixPrice ?? null,
    hetPrice: best.hetPrice ?? null,
    maxReferencePrice: best.maxReferencePrice ?? bestReferencePrice,
    referencedAt: best.fetchedAt.toISOString(),
  };
}

function getMedicationUnitPrice(med: any) {
  return Number(med.unitPrice ?? 0);
}

function getMedicationTotalPrice(med: any) {
  if (med.totalPrice !== undefined && med.totalPrice !== null) return Number(med.totalPrice);
  return getMedicationUnitPrice(med) * Number(med.quantity || 1);
}

export async function checkDrugPrices(input: DrugPriceCheckInput, jobId: string): Promise<DrugPriceCheckOutput> {
  const { providerId, medications } = input;

  // ── STEP 1: Parallel — fetch threshold config, exact master references and local medical-item master data ──
  const now = new Date();
  
  const configPromise = prisma.systemConfig.findUnique({ where: { id: 'GLOBAL_CONFIG' } });

  const exactMasterPromises = new Map<string, Promise<any>>();
  const masterPromises = new Map<string, Promise<any>>();
  
  const getMedKey = (med: any) => `${med.name?.trim()?.toLowerCase() || ''}|${med.genericName?.trim()?.toLowerCase() || ''}`;

  for (let i = 0; i < medications.length; i++) {
    const med = medications[i];
    const key = getMedKey(med);
    if (!exactMasterPromises.has(key)) {
      exactMasterPromises.set(key, prisma.medicalItemPriceMaster.findFirst({
        where: { itemName: med.name, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      }));
    }
    if (!masterPromises.has(key)) {
      masterPromises.set(key, findMedicalMasterItemPrice(med, now));
    }
  }

  const config = await configPromise;
  const exactMasterEntries = new Array(medications.length);
  const masterEntries = new Array(medications.length);
  
  for (let i = 0; i < medications.length; i++) {
    const key = getMedKey(medications[i]);
    exactMasterEntries[i] = await exactMasterPromises.get(key);
    masterEntries[i] = await masterPromises.get(key);
  }

  const thresholdPct = config?.thresholdObatPct ?? 10;

  const hasValidReferenceEntry = (index: number) => {
    const referenceEntry = exactMasterEntries[index];
    if (!referenceEntry) return false;
    const referencePrice = getBestReferencePrice(referenceEntry.maxReferencePrice, referenceEntry.hetPrice, referenceEntry.marketPriceMax, referenceEntry.fixPrice);
    const referenceSources = getJsonStringArray(referenceEntry.sources);
    return referencePrice > 0 && referenceSources.length > 0;
  };

  // ── STEP 2: AI resolver as local-master matcher only ───────────────────────
  // AI may select from local candidates using diagnosis context. It never prices,
  // never searches internet, and never invents products.
  const resolverEntries: Array<Awaited<ReturnType<typeof findMedicalMasterItemPrice>>> = new Array(medications.length).fill(null);
  const resolverIndexes = medications.map((_, index) => index).filter((index) => !masterEntries[index] && !hasValidReferenceEntry(index));
  
  if (resolverIndexes.length > 0) {
    const gateway = await getAIGateway({ clientId: input.clientId, providerId, jobId });
    
    // Deduplicate resolver requests
    const uniqueRequests = new Map<string, { index: number; med: any; key: string }>();
    for (const index of resolverIndexes) {
      const med = medications[index];
      const key = getMedKey(med);
      if (!uniqueRequests.has(key)) {
        uniqueRequests.set(key, { index, med, key });
      }
    }

    const resolverRequests = (await Promise.all(Array.from(uniqueRequests.values()).map(async ({ index, med, key }) => {
      const rankedCandidates = await getRankedMedicalItemCandidates(med, now, 50);
      const candidates = rankedCandidates.map((item) => item.candidate).slice(0, AI_RESOLVER_CANDIDATE_LIMIT);
      if (candidates.length === 0) return null;
      return { requestId: key, index, medication: med, candidates };
    }))).filter((request): request is { requestId: string; index: number; medication: any; candidates: Awaited<ReturnType<typeof getMedicalItemCandidates>> } => Boolean(request));

    const resolvedPricesByKey = new Map<string, any>();

    for (let start = 0; start < resolverRequests.length; start += AI_RESOLVER_BATCH_SIZE) {
      const batch = resolverRequests.slice(start, start + AI_RESOLVER_BATCH_SIZE);
      const candidateByRequestId = new Map(batch.map((request) => [request.requestId, request.candidates]));
      try {
        const resolved = await gateway.resolveMedicalItemMatches({
          diagnoses: input.diagnoses || [],
          requests: batch.map(({ requestId, medication, candidates }) => ({ requestId, medication, candidates })),
        });
        const matches = Array.isArray(resolved.data?.matches) ? resolved.data.matches : [];
        for (const match of matches) {
          const requestId = String(match?.requestId ?? '');
          const selectedId = match?.selectedCandidateId;
          const confidence = match?.confidence;
          if (!requestId || !selectedId || confidence === 'LOW') continue;
          const selected = candidateByRequestId.get(requestId)?.find((candidate) => candidate.id === selectedId);
          if (selected) {
            resolvedPricesByKey.set(requestId, buildFinalPriceFromMasterItem(selected));
          }
        }
      } catch (error) {
        console.error(`[checkDrugPrices] Bulk medical item resolver failed for ${batch.length} item(s):`, error);
      }
    }

    // Apply resolved prices back to all original identical medications
    for (const index of resolverIndexes) {
      const key = getMedKey(medications[index]);
      if (resolvedPricesByKey.has(key)) {
        resolverEntries[index] = resolvedPricesByKey.get(key);
      }
    }
  }

  type FinalPrice = {
    marketPriceMax: number;
    sources: string[];
    resolvedProductName?: string;
    dosageForm?: string;
    unitBasis?: string;
    fixPrice?: number | null;
    hetPrice?: number | null;
    maxReferencePrice?: number | null;
    referencedAt: string | null;
  };

  const finalPrices: FinalPrice[] = medications.map((med, i) => {
    const masterEntry = masterEntries[i];
    if (masterEntry) return masterEntry;

    const resolverEntry = resolverEntries[i];
    if (resolverEntry) return resolverEntry;

    const referenceEntry = exactMasterEntries[i];
    const referencePrice = getBestReferencePrice(
      referenceEntry?.maxReferencePrice,
      referenceEntry?.hetPrice,
      referenceEntry?.marketPriceMax,
      referenceEntry?.fixPrice,
    );
    const referenceSources = referenceEntry?.sources as string[] | undefined;
    const hasValidReference = referencePrice > 0 && Array.isArray(referenceSources) && referenceSources.length > 0;

    // No fuzzy master match → use the exact local master reference when available.
    if (hasValidReference) {
      return {
        marketPriceMax: referencePrice,
        sources: referenceSources!,
        resolvedProductName: referenceEntry!.itemName,
        dosageForm: referenceEntry!.itemTypeName || referenceEntry!.itemTypeCode || undefined,
        unitBasis: referenceEntry!.itemGroup || undefined,
        fixPrice: referenceEntry!.fixPrice ?? null,
        hetPrice: referenceEntry!.hetPrice ?? null,
        maxReferencePrice: referenceEntry!.maxReferencePrice ?? referencePrice,
        referencedAt: referenceEntry!.fetchedAt.toISOString(),
      };
    }

    // No master-data result → NOT_FOUND
    return {
      marketPriceMax: 0,
      sources: [],
      referencedAt: null,
    };
  });

  // ── STEP 3: Build output items ─────────────────────────────────────────────
  let hasOverThreshold = false;
  let hasUnderPriced = false;
  const items: DrugPriceCheckOutput['items'] = [];

  for (let i = 0; i < medications.length; i++) {
    const med = medications[i];
    const fp = finalPrices[i];
    const claimedUnitPrice = getMedicationUnitPrice(med);
    const claimedTotal = getMedicationTotalPrice(med);

    const isNonMedicationItem = fp.sources.includes('non_medication');

    if (isNonMedicationItem) {
      items.push({
        name: med.name,
        genericName: med.genericName || null,
        resolvedProductName: fp.resolvedProductName,
        dosageForm: fp.dosageForm,
        unitBasis: fp.unitBasis,
        quantity: med.quantity,
        claimedUnitPrice,
        claimedTotal,
        marketPriceMax: 0,
        marketPriceMaxWithThreshold: 0,
        expectedTotal: 0,
        fixPrice: fp.fixPrice ?? null,
        hetPrice: fp.hetPrice ?? null,
        maxReferencePrice: fp.maxReferencePrice ?? null,
        status: 'NON_MEDICATION',
        variancePct: 0,
        sources: fp.sources,
        referencedAt: null,
      });
      continue;
    }

    if (fp.marketPriceMax === 0) {
      items.push({
        name: med.name,
        genericName: med.genericName || null,
        resolvedProductName: fp.resolvedProductName,
        dosageForm: fp.dosageForm,
        unitBasis: fp.unitBasis,
        quantity: med.quantity,
        claimedUnitPrice,
        claimedTotal,
        marketPriceMax: 0,
        marketPriceMaxWithThreshold: 0,
        expectedTotal: 0,
        fixPrice: fp.fixPrice ?? null,
        hetPrice: fp.hetPrice ?? null,
        maxReferencePrice: fp.maxReferencePrice ?? null,
        status: 'NOT_FOUND',
        variancePct: 0,
        sources: fp.sources,
        referencedAt: null,
      });
      continue;
    }

    const marketPriceMaxWithThreshold = fp.marketPriceMax * (1 + thresholdPct / 100);
    let variancePct = ((claimedUnitPrice - fp.marketPriceMax) / fp.marketPriceMax) * 100;
    let status: DrugPriceCheckOutput['items'][0]['status'] = 'WITHIN_RANGE';

    if (claimedUnitPrice > marketPriceMaxWithThreshold) {
      status = 'OVER_THRESHOLD';
      hasOverThreshold = true;
    } else if (variancePct < -thresholdPct) {
      status = 'UNDER_PRICED';
      hasUnderPriced = true;
    }

    items.push({
      name: med.name,
      genericName: med.genericName || null,
      resolvedProductName: fp.resolvedProductName,
      dosageForm: fp.dosageForm,
      unitBasis: fp.unitBasis,
      quantity: med.quantity,
      claimedUnitPrice,
      claimedTotal,
      marketPriceMax: fp.marketPriceMax,
      marketPriceMaxWithThreshold,
      expectedTotal: marketPriceMaxWithThreshold * (med.quantity || 1),
      fixPrice: fp.fixPrice ?? null,
      hetPrice: fp.hetPrice ?? null,
      maxReferencePrice: fp.maxReferencePrice ?? fp.marketPriceMax,
      status,
      variancePct,
      sources: fp.sources,
      referencedAt: fp.referencedAt,
    });
  }

  let overallStatus: DrugPriceCheckOutput['status'] = 'VALID';
  if (hasOverThreshold || hasUnderPriced) overallStatus = 'WARNING';
  // ALKES items are excluded from NOT_FOUND warning — they are expected to have no drug price reference.
  if (items.some((i) => i.status === 'NOT_FOUND')) overallStatus = 'WARNING';

  return { jobId, status: overallStatus, items, thresholdConfig: { thresholdPct } };
}
