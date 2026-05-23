import prisma from '@/lib/db';
import { DrugPriceCheckInput, DrugPriceCheckOutput } from '../types';
import { getAIGateway } from '../gateway';

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
  const gateway = await getAIGateway({ clientId: input.clientId, providerId, jobId });

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
    let statusSource: "CACHE_HIT" | "NOT_FOUND" | "WITHIN_RANGE" | "OVER_THRESHOLD" | "UNDER_PRICED" = 'NOT_FOUND';

    if (cacheEntry) {
      marketPriceMax = cacheEntry.marketPriceMax;
      sources = cacheEntry.sources as string[];
      cachedAt = cacheEntry.fetchedAt.toISOString();
      statusSource = 'CACHE_HIT';
    } else {
      // 2. Cache miss -> AI-assisted web search / estimate
      try {
        const { data } = await gateway.searchDrugMarketPrice(med.name);
        
        marketPriceMax = data.marketPriceMax || 0;
        sources = data.sources || ['AI Estimate'];
        
        if (marketPriceMax > 0) {
          // Save to cache
          const now = new Date();
          const expiresAt = new Date();
          expiresAt.setDate(now.getDate() + CACHE_TTL_DAYS);
          
          await prisma.drugPriceCache.create({
            data: {
              drugName: med.name,
              drugGenericName: med.genericName,
              marketPriceMax: marketPriceMax,
              marketPriceAvg: data.marketPriceAvg,
              sources: sources,
              fetchedAt: now,
              expiresAt: expiresAt
            }
          });
          cachedAt = now.toISOString();
        }
      } catch (error) {
        console.error(`Failed to fetch drug price for ${med.name}:`, error);
        // We'll proceed with 0 market price, yielding NOT_FOUND
      }
    }

    const claimedUnitPrice = getMedicationUnitPrice(med);
    const claimedTotal = getMedicationTotalPrice(med);

    if (marketPriceMax === 0) {
      items.push({
        name: med.name,
        genericName: med.genericName || null,
        quantity: med.quantity,
        claimedUnitPrice,
        claimedTotal,
        marketPriceMax: 0,
        marketPriceMaxWithThreshold: 0,
        expectedTotal: 0,
        status: 'NOT_FOUND',
        variancePct: 0,
        sources: [],
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
