import prisma from '@/lib/db';
import { TariffValidationInput, TariffValidationOutput } from '../types';

function getProcedureUnitPrice(proc: any) {
  return Number(proc.unitPrice ?? 0);
}

function getProcedureTotalPrice(proc: any) {
  if (proc.totalPrice !== undefined && proc.totalPrice !== null) return Number(proc.totalPrice);
  return getProcedureUnitPrice(proc) * Number(proc.quantity || 1);
}

function normalizeCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProcedureName(proc: any) {
  return proc.name || proc.code || 'Tindakan';
}

function isNameCompatible(inputName: string, masterName: string) {
  if (!inputName || !masterName) return false;
  if (inputName === masterName) return true;
  const minLengthForPartialMatch = 8;
  return inputName.length >= minLengthForPartialMatch
    && masterName.length >= minLengthForPartialMatch
    && (inputName.includes(masterName) || masterName.includes(inputName));
}

async function resolveMasterTariff(proc: any, providerId: string, requestedCategory?: string) {
  const rawCode = String(proc.code ?? '').trim();
  const inputCode = normalizeCode(rawCode);
  const inputName = normalizeText(getProcedureName(proc));
  const normalizedRequestedCategory = normalizeCode(requestedCategory);

  if (inputCode) {
    const codeCandidates = await prisma.tariffEntry.findMany({
      where: {
        providerId,
        isActive: true,
        OR: [
          { procedureCode: { equals: rawCode, mode: 'insensitive' } },
          { serviceCode: { equals: rawCode, mode: 'insensitive' } },
        ],
      },
      orderBy: { maxPrice: 'desc' },
    });

    if (codeCandidates.length === 0) {
      return {
        master: null,
        matchNote: `Procedure code/service code ${rawCode} tidak ditemukan pada master tarif aktif provider ini.`,
      };
    }

    const ranked = codeCandidates
      .map((candidate) => {
        const categoryScore = normalizedRequestedCategory && normalizeCode(candidate.category) === normalizedRequestedCategory ? 30 : 0;
        const candidateName = normalizeText(candidate.procedureName);
        const exactNameScore = inputName && inputName === candidateName ? 20 : 0;
        const compatibleNameScore = !exactNameScore && isNameCompatible(inputName, candidateName) ? 10 : 0;
        const procedureCodeScore = normalizeCode(candidate.procedureCode) === inputCode ? 5 : 0;
        const serviceCodeScore = normalizeCode(candidate.serviceCode) === inputCode ? 4 : 0;
        return {
          candidate,
          score: categoryScore + exactNameScore + compatibleNameScore + procedureCodeScore + serviceCodeScore,
          hasNameMatch: exactNameScore > 0 || compatibleNameScore > 0,
        };
      })
      .sort((a, b) => b.score - a.score || b.candidate.maxPrice - a.candidate.maxPrice);

    const selected = ranked[0]?.candidate || null;
    const selectedName = normalizeText(selected?.procedureName);
    const nameMismatchNote = inputName && selectedName && !isNameCompatible(inputName, selectedName)
      ? ` Nama input berbeda dengan master tarif terpilih (${selected?.procedureName}); validasi tetap memakai exact code/service code.`
      : '';
    const duplicateNote = codeCandidates.length > 1
      ? ` Ditemukan ${codeCandidates.length} kandidat untuk code/service code yang sama; sistem memilih kandidat terbaik berdasarkan kategori, kecocokan nama, lalu harga maksimum.`
      : '';

    return {
      master: selected,
      matchNote: `Matched by exact code/service code ${rawCode}.${nameMismatchNote}${duplicateNote}`.trim(),
    };
  }

  if (!inputName) {
    return {
      master: null,
      matchNote: 'Procedure code kosong dan nama tindakan tidak tersedia, sehingga master tarif tidak bisa dipastikan secara unik.',
    };
  }

  const nameCandidates = await prisma.tariffEntry.findMany({
    where: {
      providerId,
      isActive: true,
      procedureName: { equals: getProcedureName(proc), mode: 'insensitive' },
    },
    orderBy: { maxPrice: 'desc' },
  });

  if (nameCandidates.length === 0) {
    return {
      master: null,
      matchNote: 'Procedure code kosong dan nama tindakan tidak cocok persis dengan master tarif aktif.',
    };
  }

  const ranked = nameCandidates
    .map((candidate) => ({
      candidate,
      score: normalizedRequestedCategory && normalizeCode(candidate.category) === normalizedRequestedCategory ? 30 : 0,
    }))
    .sort((a, b) => b.score - a.score || b.candidate.maxPrice - a.candidate.maxPrice);

  const selected = ranked[0]?.candidate || null;
  const duplicateNote = nameCandidates.length > 1
    ? ` Ditemukan ${nameCandidates.length} kandidat dengan nama yang sama; sistem memilih kandidat terbaik berdasarkan kategori lalu harga maksimum.`
    : '';

  return {
    master: selected,
    matchNote: `Matched by exact procedure name because procedure code is empty.${duplicateNote}`.trim(),
  };
}

export async function validateTariffPrice(input: TariffValidationInput, jobId: string): Promise<TariffValidationOutput> {
  const { providerId, procedures = [], encounterType } = input;

  // Fetch global threshold configuration from SystemConfig.
  const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL_CONFIG' } });
  const thresholdPct = config?.thresholdTindakanPct ?? 10;
  const maxAbsoluteIdr = null;

  let totalExpected = 0;
  let totalClaimed = 0;
  let hasOverThreshold = false;
  let hasUnderPriced = false;
  
  const items: TariffValidationOutput['items'] = [];

  for (const proc of procedures) {
    const quantity = Number(proc.quantity || 1);
    const claimedUnitPrice = getProcedureUnitPrice(proc);
    const claimedTotal = getProcedureTotalPrice(proc);
    totalClaimed += claimedTotal;
    
    // Find master tariff by exact procedure/service code first. Name-only matching
    // is allowed only when the input code is empty, to avoid validating the wrong
    // procedure when a similar name exists under a different code.
    const requestedCategory = proc.category || encounterType;
    const { master, matchNote } = await resolveMasterTariff(proc, providerId, requestedCategory);

    if (!master) {
      items.push({
        code: proc.code || '',
        description: getProcedureName(proc),
        quantity,
        claimedUnitPrice,
        claimedTotal,
        masterBasePrice: 0,
        masterMaxPrice: 0,
        expectedTotal: 0,
        status: 'NOT_FOUND',
        variancePct: 0,
        notes: `${matchNote} Requested category: ${requestedCategory || 'any'}.`
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
    } else if (expectedTotal > 0 && variancePct < -thresholdPct) {
      status = 'UNDER_PRICED';
      hasUnderPriced = true;
    }

    items.push({
      code: proc.code || '',
      description: getProcedureName(proc),
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
        : status === 'UNDER_PRICED'
          ? `Claimed amount is far below master tariff reference and needs review. ${matchNote}`
          : `Price is within acceptable range. ${matchNote}`
    });
  }

  const overallVariance = totalClaimed - totalExpected;
  const overallVariancePct = totalExpected > 0 ? (overallVariance / totalExpected) * 100 : 0;
  
  let overallStatus: TariffValidationOutput['status'] = 'VALID';
  if (hasOverThreshold || hasUnderPriced || overallVariancePct > thresholdPct) {
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
