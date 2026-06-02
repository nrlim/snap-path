import prisma from '@/lib/db';
import { DrugPriceCheckInput, DrugPriceCheckOutput } from '../types';
import { getAIGateway } from '../gateway';

const MASTER_DATA_SOURCE_TAG = 'master_data';
const MASTER_MATCH_MIN_SCORE = 12;
const COVERED_MEDICAL_ITEM_TYPE_CODES = new Set(['medicine', 'supplement', 'herbal', 'kuasi', 'vaccine', 'paket_obat', 'device', 'pkrt']);
const COVERED_MEDICAL_ITEM_GROUPS = new Set(['farmasi', 'alkes']);
const DRUG_SEARCH_STOPWORDS = new Set([
  'inj', 'injeksi', 'inf', 'infus', 'tablet', 'tab', 'kaps', 'kap', 'capsule', 'cap',
  'amp', 'ampul', 'vial', 'vl', 'sirup', 'syrup', 'syr', 'susp', 'cream', 'krim',
  'salep', 'gel', 'strip', 'pcs', 'unit', 'botol', 'btl', 'ml', 'mg', 'gram', 'gr',
]);

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

function isMeaningfulReferencePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 100;
}

function getBestReferencePrice(...prices: unknown[]): number {
  const meaningfulPrices = prices.filter(isMeaningfulReferencePrice);
  return meaningfulPrices.length > 0 ? Math.max(...meaningfulPrices) : 0;
}

function getSearchTokens(med: any): string[] {
  const normalized = normalizeSearchText(`${med.name || ''} ${med.genericName || ''}`);
  return Array.from(new Set(normalized.split(' ').filter((token) => token.length >= 3 && !DRUG_SEARCH_STOPWORDS.has(token)))).slice(0, 5);
}

function scoreMasterDrugCandidate(med: any, candidate: { itemName: string; itemGenericName: string | null; itemTypeCode: string | null; itemGroup: string | null; sources: unknown }) {
  const sources = getJsonStringArray(candidate.sources);
  if (!sources.some((source) => source.includes(MASTER_DATA_SOURCE_TAG))) return -1;

  const medText = normalizeSearchText(`${med.name || ''} ${med.genericName || ''}`);
  const candidateName = normalizeSearchText(candidate.itemName);
  const candidateGeneric = normalizeSearchText(candidate.itemGenericName || '');
  const candidateText = `${candidateName} ${candidateGeneric}`.trim();
  const tokens = getSearchTokens(med);

  let score = 0;
  if (candidateName === normalizeSearchText(med.name)) score += 100;
  if (candidateGeneric && candidateGeneric === normalizeSearchText(med.genericName)) score += 80;
  if (candidateText.includes(medText) || medText.includes(candidateName)) score += 45;
  if (normalizeSearchText(candidate.itemGroup || '') === 'farmasi') score += 6;
  if (normalizeSearchText(candidate.itemTypeCode || '') === 'medicine') score += 6;
  for (const token of tokens) {
    if (candidateName.includes(token)) score += 12;
    if (candidateGeneric.includes(token)) score += 8;
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

async function findMedicalMasterItemPrice(med: any, now: Date) {
  const candidates = await getMedicalItemCandidates(med, now, 50);
  if (candidates.length === 0) return null;

  let best: (typeof candidates)[number] | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreMasterDrugCandidate(med, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore < MASTER_MATCH_MIN_SCORE || best.marketPriceMax <= 0) return null;

  return buildFinalPriceFromMasterItem(best);
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
  const [config, exactMasterEntries, masterEntries] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 'GLOBAL_CONFIG' } }),
    Promise.all(medications.map((med) =>
      prisma.medicalItemPriceMaster.findFirst({
        where: { itemName: med.name, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      }),
    )),
    Promise.all(medications.map((med) => findMedicalMasterItemPrice(med, now))),
  ]);

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
    await Promise.all(resolverIndexes.map(async (index) => {
      const med = medications[index];
      const candidates = await getMedicalItemCandidates(med, now, 20);
      if (candidates.length === 0) return;
      try {
        const resolved = await gateway.resolveMedicalItemMatch({ medication: med, diagnoses: input.diagnoses || [], candidates });
        const selectedId = resolved.data?.selectedCandidateId;
        const confidence = resolved.data?.confidence;
        if (!selectedId || confidence === 'LOW') return;
        const selected = candidates.find((candidate) => candidate.id === selectedId);
        if (selected) resolverEntries[index] = buildFinalPriceFromMasterItem(selected);
      } catch (error) {
        console.error(`[checkDrugPrices] Medical item resolver failed for ${med.name}:`, error);
      }
    }));
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
