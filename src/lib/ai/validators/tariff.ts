import prisma from '@/lib/db';
import { TariffValidationInput, TariffValidationOutput } from '../types';

function getProcedureUnitPrice(proc: any) {
  return Number(proc.unitPrice ?? proc.price ?? proc.claimedUnitPrice ?? 0);
}

function getProcedureTotalPrice(proc: any) {
  const explicitTotal = proc.totalPrice ?? proc.claimedTotal ?? proc.claimedPrice;
  if (explicitTotal !== undefined && explicitTotal !== null) return Number(explicitTotal);
  return getProcedureUnitPrice(proc) * Number(proc.quantity || 1);
}

export async function validateTariffPrice(input: TariffValidationInput, jobId: string): Promise<TariffValidationOutput> {
  const { providerId, procedures, encounterType } = input;

  // Fetch Threshold Config
  const thresholdRecord = await prisma.thresholdConfig.findUnique({
    where: {
      providerId_category: {
        providerId,
        category: 'TARIFF'
      }
    }
  });

  const thresholdPct = thresholdRecord?.thresholdPct ?? 0;
  const maxAbsoluteIdr = thresholdRecord?.maxAbsoluteIdr ?? null;

  let totalExpected = 0;
  let totalClaimed = 0;
  let hasOverThreshold = false;
  
  const items: TariffValidationOutput['items'] = [];

  for (const proc of procedures) {
    const quantity = Number(proc.quantity || 1);
    const claimedUnitPrice = getProcedureUnitPrice(proc);
    const claimedTotal = getProcedureTotalPrice(proc);
    totalClaimed += claimedTotal;
    
    // Find master tariff
    const masterEntries = await prisma.tariffEntry.findMany({
      where: {
        providerId,
        procedureCode: proc.code,
        isActive: true,
        category: proc.category || encounterType,
        // In real app, might want to check regionCode as well
      },
      orderBy: { maxPrice: 'desc' },
      take: 1
    });

    const master = masterEntries[0];

    if (!master) {
      items.push({
        code: proc.code,
        description: proc.description || (proc as any).name || proc.code,
        quantity,
        claimedUnitPrice,
        claimedTotal,
        masterBasePrice: 0,
        masterMaxPrice: 0,
        expectedTotal: 0,
        status: 'NOT_FOUND',
        variancePct: 0,
        notes: 'Procedure code not found in master tariff book for this provider/category.'
      });
      continue;
    }

    const expectedTotal = master.maxPrice * quantity;    totalExpected += expectedTotal;

    const diff = claimedTotal - expectedTotal;
    let variancePct = 0;
    
    if (expectedTotal > 0) {
      variancePct = (diff / expectedTotal) * 100;
    } else if (claimedTotal > 0) {
      variancePct = 100; // Infinity mathematically, but let's call it 100% variance
    }
    
    let status: TariffValidationOutput['items'][0]['status'] = 'WITHIN_RANGE';
    
    if (variancePct > thresholdPct) {
      status = 'OVER_THRESHOLD';
      hasOverThreshold = true;
    } else if (expectedTotal > 0 && variancePct < -20) { // arbitrary under-price check
      status = 'UNDER_PRICED';
    }

    items.push({
      code: proc.code,
      description: proc.description || (proc as any).name || proc.code,
      quantity,
      claimedUnitPrice,
      claimedTotal,
      masterBasePrice: master.basePrice,
      masterMaxPrice: master.maxPrice,
      expectedTotal,
      status,
      variancePct,
      notes: status === 'OVER_THRESHOLD' 
        ? `Claimed amount exceeds maximum allowed (${thresholdPct}% threshold).`
        : 'Price is within acceptable range.'
    });
  }

  const overallVariance = totalClaimed - totalExpected;
  const overallVariancePct = totalExpected > 0 ? (overallVariance / totalExpected) * 100 : 0;
  
  let overallStatus: TariffValidationOutput['status'] = 'VALID';
  if (hasOverThreshold || overallVariancePct > thresholdPct) {
    overallStatus = 'WARNING';
  }
  // Could add 'INVALID' if it violates absolute max rules

  return {
    jobId,
    status: overallStatus,
    totalExpected,
    totalClaimed,
    variance: overallVariance,
    variancePct: overallVariancePct,
    thresholdConfig: {
      thresholdPct,
      maxAbsoluteIdr
    },
    items
  };
}
