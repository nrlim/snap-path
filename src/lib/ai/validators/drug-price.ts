import prisma from '@/lib/db';
import { DrugPriceCheckInput, DrugPriceCheckOutput } from '../types';
import { getAIGateway } from '../gateway';

// AI knowledge-based cache TTL (3 days). Entries are refreshed by always calling AI
// and only updated when the AI returns a different price from what's cached.
const AI_CACHE_TTL_DAYS = 3;
const AI_KNOWLEDGE_SOURCE_TAG = 'ai_knowledge_v1';

// Maximum number of drugs per batch AI call.
const BATCH_SIZE = 15;

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

  // ── STEP 1: Parallel — fetch threshold config + all cache entries at once ──
  const now = new Date();
  const [thresholdRecord, ...cacheEntries] = await Promise.all([
    prisma.thresholdConfig.findUnique({
      where: { providerId_category: { providerId, category: 'DRUG_PRICE' } },
    }),
    ...medications.map((med) =>
      prisma.drugPriceCache.findFirst({
        where: { drugName: med.name, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      }),
    ),
  ]);

  const thresholdPct = thresholdRecord?.thresholdPct ?? 0;

  // ── STEP 2: Always call AI batch — even if cache exists ────────────────────
  // AI is the primary source of truth. Cache only serves as fallback and as a
  // "last known price" to avoid unnecessary DB writes (skip update if same price).
  type AiResult = {
    marketPriceMax: number;
    marketPriceAvg: number | null;
    sources: string[];
    resolvedProductName?: string;
    dosageForm?: string;
    unitBasis?: string;
  };

  const aiResults: (AiResult | null)[] = new Array(medications.length).fill(null);

  const gateway = await getAIGateway({ clientId: input.clientId, providerId });

  for (let batchStart = 0; batchStart < medications.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, medications.length);
    const batchDrugs = medications.slice(batchStart, batchEnd).map((m) => ({
      name: m.name,
      genericName: m.genericName || null,
      dosage: m.dosage || null,
    }));

    try {
      const batchResult = await gateway.searchDrugMarketPriceBatch(batchDrugs);
      const batchData: any[] = Array.isArray(batchResult?.data) ? batchResult.data : [];

      batchData.forEach((aiData, batchPos) => {
        const medIndex = batchStart + batchPos;
        if (medIndex === undefined || medIndex >= medications.length) return;

        // ALKES (alat kesehatan) — medical supply/device, not a drug.
        // Skip cache and scoring; mark separately for UI display.
        if (aiData?.isAlkes === true) {
          aiResults[medIndex] = {
            marketPriceMax: 0,
            marketPriceAvg: null,
            sources: ['alkes'],
            resolvedProductName: aiData?.resolvedProductName || undefined,
            dosageForm: aiData?.dosageForm || undefined,
            unitBasis: aiData?.unitBasis || undefined,
          };
          return;
        }

        const aiPrice = Number(aiData?.marketPriceMax ?? 0);
        const aiSources: string[] = Array.isArray(aiData?.sources) ? aiData.sources : [];

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

  // ── STEP 3: Reconcile AI results with cache — smart update ─────────────────
  // For each drug:
  //   - If AI returned a price AND it differs from cached price → update cache
  //   - If AI returned a price AND it matches cached price → skip DB write
  //   - If AI returned 0 → use cached price if available (graceful fallback)
  const persistPromises: Promise<any>[] = [];

  type FinalPrice = {
    marketPriceMax: number;
    sources: string[];
    resolvedProductName?: string;
    dosageForm?: string;
    unitBasis?: string;
    cachedAt: string | null;
  };

  const finalPrices: FinalPrice[] = medications.map((med, i) => {
    const aiResult = aiResults[i];
    const cacheEntry = cacheEntries[i];
    const cachedPrice = cacheEntry?.marketPriceMax ?? 0;
    const cachedSources = cacheEntry?.sources as string[] | undefined;
    const hasValidCache = cachedPrice > 0 && Array.isArray(cachedSources) && cachedSources.length > 0;

    // ALKES detected by AI — medical supply, not a drug. Skip cache entirely.
    const isAlkes = aiResult !== null && Array.isArray(aiResult.sources) && aiResult.sources.includes('alkes');
    if (isAlkes) {
      return {
        marketPriceMax: 0,
        sources: ['alkes'],
        resolvedProductName: aiResult!.resolvedProductName,
        dosageForm: aiResult!.dosageForm,
        unitBasis: aiResult!.unitBasis,
        cachedAt: null,
      };
    }

    // AI succeeded → use AI result
    if (aiResult && aiResult.marketPriceMax > 0) {
      const priceChanged = aiResult.marketPriceMax !== cachedPrice;

      if (priceChanged) {
        // AI price differs from cache (or no cache exists) → write/update cache
        const expiresAt = new Date(now);
        expiresAt.setDate(now.getDate() + AI_CACHE_TTL_DAYS);

        persistPromises.push(
          prisma.drugPriceCache.upsert({
            where: {
              // Use drugName as the unique key for upsert; if no existing record,
              // Prisma creates a new one. If one exists, it's updated.
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
      // else: price is the same → skip DB write, save latency

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

    const isAlkesItem = fp.sources.includes('alkes');

    if (isAlkesItem) {
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
        status: 'ALKES',
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
