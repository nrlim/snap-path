import prisma from '@/lib/db';
import { DrugPriceCheckInput, DrugPriceCheckOutput } from '../types';
import { crawlIndonesianDrugPrice } from '../drug-web-price';

const CACHE_TTL_DAYS = 7;

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
    const isVerifiedCache = Array.isArray(cachedSources) && cachedSources.some((source) => source.includes('verification_v2'));

    if (cacheEntry && isVerifiedCache) {
      marketPriceMax = cacheEntry.marketPriceMax;
      sources = cachedSources;
      cachedAt = cacheEntry.fetchedAt.toISOString();
      statusSource = 'CACHE_HIT';
    } else {
      // 2. Cache miss -> direct internet crawl from public Indonesian pharmacy/catalog pages.
      // No third-party search API keys are required for drug price lookup.
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

        if (marketPriceMax > 0 && crawled.sources.some((source) => source.includes('verification_v2'))) {
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
      } catch (error) {
        console.error(`Failed to crawl drug price for ${med.name}:`, error);
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
