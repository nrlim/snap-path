import prisma from '@/lib/db';
import { DrugPriceCheckInput, DrugPriceCheckOutput } from '../types';
import { crawlIndonesianDrugPrice } from '../drug-web-price';
import { getAIGateway } from '../gateway';

const CACHE_TTL_DAYS = 7;
const AI_CACHE_TTL_DAYS = 3; // AI knowledge-based prices expire sooner than crawl-verified
const AI_KNOWLEDGE_SOURCE_TAG = 'ai_knowledge_v1';
const CRAWL_VERIFIED_SOURCE_TAG = 'verification_v2';

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

  // Fetch Threshold Config
  const thresholdRecord = await prisma.thresholdConfig.findUnique({
    where: {
      providerId_category: {
        providerId,
        category: 'DRUG_PRICE'
      }
    }
  });

  const thresholdPct = thresholdRecord?.thresholdPct ?? 0;
  let hasOverThreshold = false;
  let hasUnderPriced = false;
  
  const items: DrugPriceCheckOutput['items'] = [];

  for (const med of medications) {
    // 1. Check Cache
    const cacheEntry = await prisma.drugPriceCache.findFirst({
      where: {
        drugName: med.name,
        expiresAt: { gt: new Date() } // not expired
      },
      orderBy: { createdAt: 'desc' }
    });

    let marketPriceMax = 0;
    let sources: string[] = [];
    let cachedAt: string | null = null;
    let resolvedProductName: string | undefined;
    let dosageForm: string | undefined;
    let unitBasis: string | undefined;
    let statusSource: "CACHE_HIT" | "NOT_FOUND" | "WITHIN_RANGE" | "OVER_THRESHOLD" | "UNDER_PRICED" = 'NOT_FOUND';

    const cachedSources = cacheEntry?.sources as string[] | undefined;
    // Accept cache entries from either crawl-verified or AI knowledge-based lookups
    const isValidCache = Array.isArray(cachedSources) && cachedSources.length > 0 &&
      cachedSources.some((s) => s.includes(CRAWL_VERIFIED_SOURCE_TAG) || s.includes(AI_KNOWLEDGE_SOURCE_TAG));

    if (cacheEntry && isValidCache) {
      marketPriceMax = cacheEntry.marketPriceMax;
      sources = cachedSources;
      cachedAt = cacheEntry.fetchedAt.toISOString();
      statusSource = 'CACHE_HIT';
    } else {
      // 2. Cache miss → try web crawl first (fast, free, no AI tokens).
      // In practice this almost always returns 0 because pharmacy sites are JS-rendered
      // SPAs that block server-side fetching — the AI fallback below handles those cases.
      try {
        const crawled = await crawlIndonesianDrugPrice({
          name: med.name,
          genericName: med.genericName || null,
          dosage: med.dosage || null,
        });

        marketPriceMax = crawled.marketPriceMax || 0;
        sources = crawled.sources;
        resolvedProductName = crawled.resolvedProductName || resolvedProductName;
        dosageForm = crawled.dosageForm || dosageForm;
        unitBasis = crawled.unitBasis || unitBasis;

        if (marketPriceMax > 0 && crawled.sources.some((s) => s.includes(CRAWL_VERIFIED_SOURCE_TAG))) {
          const now = new Date();
          const expiresAt = new Date();
          expiresAt.setDate(now.getDate() + CACHE_TTL_DAYS);

          await prisma.drugPriceCache.create({
            data: {
              drugName: med.name,
              drugGenericName: med.genericName,
              marketPriceMax,
              marketPriceAvg: crawled.marketPriceAvg,
              sources,
              fetchedAt: now,
              expiresAt,
            },
          });
          cachedAt = now.toISOString();
        }
      } catch (crawlError) {
        console.error(`[checkDrugPrices] Web crawl failed for ${med.name}:`, crawlError);
      }

      // 3. AI knowledge fallback — runs when web crawl returns no price.
      // The AI model uses training knowledge of Indonesian pharmacy prices (K24Klik, Halodoc,
      // Farmaku, MIMS, e-Katalog, HET/HNA data) to provide a reference price.
      // This covers virtually all drugs in the Indonesian formulary since they were in training data.
      if (marketPriceMax === 0) {
        try {
          const gateway = await getAIGateway({ clientId: input.clientId, providerId });
          const aiResult = await gateway.searchDrugMarketPrice({
            name: med.name,
            genericName: med.genericName || null,
            dosage: med.dosage || null,
          });

          const aiData = aiResult?.data;
          const aiPrice = Number(aiData?.marketPriceMax ?? 0);
          const aiSources: string[] = Array.isArray(aiData?.sources) ? aiData.sources : [];
          const isAiKnowledgeResult = aiSources.some((s: string) => s.includes(AI_KNOWLEDGE_SOURCE_TAG));

          if (aiPrice > 0 && isAiKnowledgeResult) {
            marketPriceMax = aiPrice;
            sources = aiSources;
            resolvedProductName = aiData?.resolvedProductName || resolvedProductName;
            dosageForm = aiData?.dosageForm || dosageForm;
            unitBasis = aiData?.unitBasis || unitBasis;

            // Cache AI-sourced prices with a shorter TTL (3 days) since they come from training
            // knowledge rather than a live crawl, and may be less precise.
            const now = new Date();
            const expiresAt = new Date();
            expiresAt.setDate(now.getDate() + AI_CACHE_TTL_DAYS);

            await prisma.drugPriceCache.create({
              data: {
                drugName: med.name,
                drugGenericName: med.genericName,
                marketPriceMax,
                marketPriceAvg: typeof aiData?.marketPriceAvg === 'number' ? aiData.marketPriceAvg : null,
                sources,
                fetchedAt: now,
                expiresAt,
              },
            });
            cachedAt = now.toISOString();
          }
        } catch (aiError) {
          console.error(`[checkDrugPrices] AI knowledge fallback failed for ${med.name}:`, aiError);
        }
      }
    }

    const claimedUnitPrice = getMedicationUnitPrice(med);
    const claimedTotal = getMedicationTotalPrice(med);

    if (marketPriceMax === 0) {
      items.push({
        name: med.name,
        genericName: med.genericName || null,
        resolvedProductName,
        dosageForm,
        unitBasis,
        quantity: med.quantity,
        claimedUnitPrice,
        claimedTotal,
        marketPriceMax: 0,
        marketPriceMaxWithThreshold: 0,
        expectedTotal: 0,
        status: 'NOT_FOUND',
        variancePct: 0,
        sources,
        cachedAt: null
      });
      continue;
    }

    const marketPriceMaxWithThreshold = marketPriceMax * (1 + (thresholdPct / 100));
    
    let variancePct = 0;
    let status: DrugPriceCheckOutput['items'][0]['status'] = 'WITHIN_RANGE';

    if (claimedUnitPrice > marketPriceMaxWithThreshold) {
      status = 'OVER_THRESHOLD';
      variancePct = ((claimedUnitPrice - marketPriceMax) / marketPriceMax) * 100;
      hasOverThreshold = true;
    } else {
      variancePct = ((claimedUnitPrice - marketPriceMax) / marketPriceMax) * 100;
      if (variancePct < -20) {
        status = 'UNDER_PRICED';
        hasUnderPriced = true;
      }
    }

    items.push({
      name: med.name,
      genericName: med.genericName || null,
      resolvedProductName,
      dosageForm,
      unitBasis,
      quantity: med.quantity,
      claimedUnitPrice,
      claimedTotal,
      marketPriceMax,
      marketPriceMaxWithThreshold,
      expectedTotal: marketPriceMaxWithThreshold * (med.quantity || 1),
      status,
      variancePct,
      sources,
      cachedAt
    });
  }

  let overallStatus: DrugPriceCheckOutput['status'] = 'VALID';
  if (hasOverThreshold || hasUnderPriced) overallStatus = 'WARNING';
  if (items.some(i => i.status === 'NOT_FOUND')) overallStatus = 'WARNING';

  return {
    jobId,
    status: overallStatus,
    items,
    thresholdConfig: {
      thresholdPct
    }
  };
}
