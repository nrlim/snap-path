import prisma from '@/lib/db';
import { DrugPriceCheckInput, DrugPriceCheckOutput } from '../types';
import { getAIGateway } from '../gateway';

// AI knowledge-based cache TTL (3 days). Entries are refreshed by always calling AI
// and only updated when the AI returns a different price from what's cached.
const AI_CACHE_TTL_DAYS = 3;
const AI_KNOWLEDGE_SOURCE_TAG = 'ai_knowledge_v1';

// Maximum number of drugs per batch AI call.
const BATCH_SIZE = 15;
const KFA_MASTER_SOURCE_TAG = 'master_data_kfa';
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

function getSearchTokens(med: any): string[] {
  const normalized = normalizeSearchText(`${med.name || ''} ${med.genericName || ''}`);
  return Array.from(new Set(normalized.split(' ').filter((token) => token.length >= 3 && !DRUG_SEARCH_STOPWORDS.has(token)))).slice(0, 5);
}

function scoreMasterDrugCandidate(med: any, candidate: { drugName: string; drugGenericName: string | null; sources: unknown }) {
  const sources = getJsonStringArray(candidate.sources);
  if (!sources.some((source) => source.includes(KFA_MASTER_SOURCE_TAG))) return -1;

  const medText = normalizeSearchText(`${med.name || ''} ${med.genericName || ''}`);
  const candidateName = normalizeSearchText(candidate.drugName);
  const candidateGeneric = normalizeSearchText(candidate.drugGenericName || '');
  const candidateText = `${candidateName} ${candidateGeneric}`.trim();
  const tokens = getSearchTokens(med);

  let score = 0;
  if (candidateName === normalizeSearchText(med.name)) score += 100;
  if (candidateGeneric && candidateGeneric === normalizeSearchText(med.genericName)) score += 80;
  if (candidateText.includes(medText) || medText.includes(candidateName)) score += 45;
  for (const token of tokens) {
    if (candidateName.includes(token)) score += 12;
    if (candidateGeneric.includes(token)) score += 8;
  }

  return score;
}

async function findKfaMasterDrugPrice(med: any, now: Date) {
  const tokens = getSearchTokens(med);
  if (tokens.length === 0) return null;

  const candidates = await prisma.drugPriceCache.findMany({
    where: {
      expiresAt: { gt: now },
      OR: tokens.flatMap((token) => [
        { drugName: { contains: token, mode: 'insensitive' as const } },
        { drugGenericName: { contains: token, mode: 'insensitive' as const } },
      ]),
    },
    orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });

  let best: (typeof candidates)[number] | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreMasterDrugCandidate(med, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore < 12 || best.marketPriceMax <= 0) return null;

  return {
    marketPriceMax: best.marketPriceMax,
    sources: getJsonStringArray(best.sources),
    resolvedProductName: best.drugName,
    dosageForm: undefined,
    unitBasis: undefined,
    cachedAt: best.fetchedAt.toISOString(),
  };
}

function getMedicationUnitPrice(med: any) {
  return Number(med.unitPrice ?? med.price ?? med.claimedUnitPrice ?? 0);
}

function getMedicationTotalPrice(med: any) {
  const explicitTotal = med.totalPrice ?? med.claimedTotal;
  if (explicitTotal !== undefined && explicitTotal !== null) return Number(explicitTotal);
  return getMedicationUnitPrice(med) * Number(med.quantity || 1);
}

export async function checkDrugPrices(input: DrugPriceCheckInput, jobId: string): Promise<DrugPriceCheckOutput> {
  const { providerId, medications } = input;

  // ── STEP 1: Parallel — fetch threshold config, AI cache, and KFA master data ──
  const now = new Date();
  const [thresholdRecord, cacheEntries, masterEntries] = await Promise.all([
    prisma.thresholdConfig.findUnique({
      where: { providerId_category: { providerId, category: 'DRUG_PRICE' } },
    }),
    Promise.all(medications.map((med) =>
      prisma.drugPriceCache.findFirst({
        where: { drugName: med.name, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      }),
    )),
    Promise.all(medications.map((med) => findKfaMasterDrugPrice(med, now))),
  ]);

  const thresholdPct = thresholdRecord?.thresholdPct ?? 0;

  // ── STEP 2: KFA master data is the first source of truth ───────────────────
  // If a medication is found in local Master Obat KFA, use it immediately and do
  // not call the online/AI price lookup for that item.
  type AiResult = {
    marketPriceMax: number;
    marketPriceAvg: number | null;
    sources: string[];
    resolvedProductName?: string;
    dosageForm?: string;
    unitBasis?: string;
  };

  const aiResults: (AiResult | null)[] = new Array(medications.length).fill(null);

  const aiLookupIndexes = medications
    .map((_, index) => index)
    .filter((index) => !masterEntries[index]);
  const gateway = aiLookupIndexes.length > 0 ? await getAIGateway({ clientId: input.clientId, providerId }) : null;

  for (let batchStart = 0; batchStart < aiLookupIndexes.length; batchStart += BATCH_SIZE) {
    const batchIndexes = aiLookupIndexes.slice(batchStart, batchStart + BATCH_SIZE);
    const batchDrugs = batchIndexes.map((index) => {
      const med = medications[index];
      return {
        name: med.name,
        genericName: med.genericName || null,
        dosage: med.dosage || null,
      };
    });

    try {
      const batchResult = await gateway!.searchDrugMarketPriceBatch(batchDrugs);
      const batchData: any[] = Array.isArray(batchResult?.data) ? batchResult.data : [];

      batchData.forEach((aiData, batchPos) => {
        const medIndex = batchIndexes[batchPos];
        if (medIndex === undefined || medIndex >= medications.length) return;

        const aiPrice = Number(aiData?.marketPriceMax ?? 0);
        const aiSources: string[] = Array.isArray(aiData?.sources) ? [...aiData.sources] : [];

        // NON-MEDICATION — medical supply/device/service, not a drug.
        // Skip cache and scoring; mark separately for UI display.
        if (aiData?.isNonMedication === true) {
          aiResults[medIndex] = {
            marketPriceMax: 0,
            marketPriceAvg: null,
            sources: ['non_medication'],
            resolvedProductName: aiData?.resolvedProductName || undefined,
            dosageForm: aiData?.dosageForm || undefined,
            unitBasis: aiData?.unitBasis || undefined,
          };
          return;
        }

        if (aiPrice > 0 && aiSources.some((s) => s.includes(AI_KNOWLEDGE_SOURCE_TAG))) {
          aiResults[medIndex] = {
            marketPriceMax: aiPrice,
            marketPriceAvg: typeof aiData?.marketPriceAvg === 'number' ? aiData.marketPriceAvg : null,
            sources: aiSources,
            resolvedProductName: aiData?.resolvedProductName || undefined,
            dosageForm: aiData?.dosageForm || undefined,
            unitBasis: aiData?.unitBasis || undefined,
          };
        }
      });
    } catch (aiError) {
      console.error(`[checkDrugPrices] Batch AI lookup failed (batch ${Math.floor(batchStart / BATCH_SIZE) + 1}):`, aiError);
      // Non-fatal: fall back to cache for drugs in this batch.
    }
  }

  // ── STEP 3: Reconcile master data, AI results, and cache ──────────────────
  // For each drug:
  //   - If KFA master data matched → use it and stop (no internet/AI lookup)
  //   - If AI returned a price AND it differs from cached price → update cache
  //   - If AI returned a price AND it matches cached price → skip DB write
  //   - If AI returned 0 → use cached price if available (graceful fallback)
  const persistPromises: Promise<any>[] = [];
  const persistedDrugNames = new Set<string>();

  type FinalPrice = {
    marketPriceMax: number;
    sources: string[];
    resolvedProductName?: string;
    dosageForm?: string;
    unitBasis?: string;
    cachedAt: string | null;
  };

  const finalPrices: FinalPrice[] = medications.map((med, i) => {
    const masterEntry = masterEntries[i];
    if (masterEntry) return masterEntry;

    const aiResult = aiResults[i];
    const cacheEntry = cacheEntries[i];
    const cachedPrice = cacheEntry?.marketPriceMax ?? 0;
    const cachedSources = cacheEntry?.sources as string[] | undefined;
    const hasValidCache = cachedPrice > 0 && Array.isArray(cachedSources) && cachedSources.length > 0;

    // NON-MEDICATION detected by AI — medical supply, service, not a drug. Skip cache entirely.
    const isNonMedication = aiResult !== null && Array.isArray(aiResult.sources) && aiResult.sources.includes('non_medication');
    if (isNonMedication) {
      return {
        marketPriceMax: 0,
        sources: ['non_medication'],
        resolvedProductName: aiResult!.resolvedProductName,
        dosageForm: aiResult!.dosageForm,
        unitBasis: aiResult!.unitBasis,
        cachedAt: null,
      };
    }

    // AI succeeded → use AI result
    if (aiResult && aiResult.marketPriceMax > 0) {
      const priceChanged = aiResult.marketPriceMax !== cachedPrice;

      if (priceChanged && !persistedDrugNames.has(med.name)) {
        persistedDrugNames.add(med.name);

        // AI price differs from cache (or no cache exists) → write/update cache
        const expiresAt = new Date(now);
        expiresAt.setDate(now.getDate() + AI_CACHE_TTL_DAYS);

        persistPromises.push(
          prisma.drugPriceCache.upsert({
            where: {
              // Prisma creates a new one if id is not found. If one exists, it's updated.
              id: cacheEntry?.id ?? '',
            },
            update: {
              marketPriceMax: aiResult.marketPriceMax,
              marketPriceAvg: aiResult.marketPriceAvg,
              sources: aiResult.sources,
              fetchedAt: now,
              expiresAt,
            },
            create: {
              drugName: med.name,
              drugGenericName: med.genericName,
              marketPriceMax: aiResult.marketPriceMax,
              marketPriceAvg: aiResult.marketPriceAvg,
              sources: aiResult.sources,
              fetchedAt: now,
              expiresAt,
            },
          }).catch((err) => {
            console.error(`[checkDrugPrices] Cache upsert failed for ${med.name}:`, err);
          }),
        );
      }
      // else: price is the same or already queued for write → skip DB write, save latency

      return {
        marketPriceMax: aiResult.marketPriceMax,
        sources: aiResult.sources,
        resolvedProductName: aiResult.resolvedProductName,
        dosageForm: aiResult.dosageForm,
        unitBasis: aiResult.unitBasis,
        cachedAt: priceChanged ? now.toISOString() : (cacheEntry?.fetchedAt?.toISOString() ?? now.toISOString()),
      };
    }

    // AI returned 0 or failed → fall back to cache
    if (hasValidCache) {
      return {
        marketPriceMax: cachedPrice,
        sources: cachedSources!,
        cachedAt: cacheEntry!.fetchedAt.toISOString(),
      };
    }

    // No AI result AND no cache → NOT_FOUND
    return {
      marketPriceMax: 0,
      sources: [],
      cachedAt: null,
    };
  });

  // Fire all cache writes in parallel — non-blocking.
  if (persistPromises.length > 0) {
    await Promise.allSettled(persistPromises);
  }

  // ── STEP 4: Build output items ─────────────────────────────────────────────
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
        status: 'NON_MEDICATION',
        variancePct: 0,
        sources: fp.sources,
        cachedAt: null,
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
        status: 'NOT_FOUND',
        variancePct: 0,
        sources: fp.sources,
        cachedAt: null,
      });
      continue;
    }

    const marketPriceMaxWithThreshold = fp.marketPriceMax * (1 + thresholdPct / 100);
    let variancePct = ((claimedUnitPrice - fp.marketPriceMax) / fp.marketPriceMax) * 100;
    let status: DrugPriceCheckOutput['items'][0]['status'] = 'WITHIN_RANGE';

    if (claimedUnitPrice > marketPriceMaxWithThreshold) {
      status = 'OVER_THRESHOLD';
      hasOverThreshold = true;
    } else if (variancePct < -20) {
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
      status,
      variancePct,
      sources: fp.sources,
      cachedAt: fp.cachedAt,
    });
  }

  let overallStatus: DrugPriceCheckOutput['status'] = 'VALID';
  if (hasOverThreshold || hasUnderPriced) overallStatus = 'WARNING';
  // ALKES items are excluded from NOT_FOUND warning — they are expected to have no drug price reference.
  if (items.some((i) => i.status === 'NOT_FOUND')) overallStatus = 'WARNING';

  return { jobId, status: overallStatus, items, thresholdConfig: { thresholdPct } };
}
