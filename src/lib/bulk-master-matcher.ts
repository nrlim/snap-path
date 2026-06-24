import prisma from '@/lib/db';

function normalizeText(text: string | null | undefined): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bulk lookup master data to populate `code` fields for procedures and normalize `name` for medications
 * in the AI Mapped Payload, since OCR usually only extracts names.
 */
export async function resolvePayloadWithBulkMasterData(payload: any, providerId: string) {
  if (!payload) return payload;

  const procedures = Array.isArray(payload.procedures) ? payload.procedures : [];
  const medications = Array.isArray(payload.medications) ? payload.medications : [];

  if (procedures.length === 0 && medications.length === 0) {
    return payload;
  }

  // 1. Fetch all master data in bulk (single query per table)
  // Tariff is per provider, MedicalItemPriceMaster is global
  const [tariffs, drugs] = await Promise.all([
    prisma.tariffEntry.findMany({
      where: { providerId, isActive: true },
      select: { procedureCode: true, serviceCode: true, procedureName: true, category: true }
    }),
    prisma.medicalItemPriceMaster.findMany({
      select: { id: true, itemName: true, itemGenericName: true }
    })
  ]);

  // 2. Build in-memory search indices
  const tariffIdx = tariffs.map(t => ({
    ...t,
    normName: normalizeText(t.procedureName)
  }));
  
  const drugIdx = drugs.map(d => ({
    ...d,
    normName: normalizeText(d.itemName),
    normGeneric: normalizeText(d.itemGenericName)
  }));

  // Helper for fuzzy match
  const findBestTariff = (rawName: string) => {
    const norm = normalizeText(rawName);
    if (!norm) return null;
    
    // 1. Exact match
    const exact = tariffIdx.find(t => t.normName === norm);
    if (exact) return exact;

    // 2. Partial match (name includes norm or norm includes name if length > 8)
    if (norm.length > 8) {
      const partial = tariffIdx.find(t => t.normName.includes(norm) || norm.includes(t.normName));
      if (partial) return partial;
    }
    return null;
  };

  const findBestDrug = (rawName: string) => {
    const norm = normalizeText(rawName);
    if (!norm) return null;

    // 1. Exact name match
    let exact = drugIdx.find(d => d.normName === norm);
    if (exact) return exact;

    // 2. Exact generic match
    exact = drugIdx.find(d => d.normGeneric === norm);
    if (exact) return exact;

    // 3. Partial match
    if (norm.length > 8) {
      const partial = drugIdx.find(d => 
        (d.normName.length > 5 && (d.normName.includes(norm) || norm.includes(d.normName))) ||
        (d.normGeneric.length > 5 && (d.normGeneric.includes(norm) || norm.includes(d.normGeneric)))
      );
      if (partial) return partial;
    }
    return null;
  };

  // 3. Apply matches to payload
  for (const proc of procedures) {
    if (!proc.name) continue;
    
    const matched = findBestTariff(proc.name);
    if (matched) {
      proc.code = matched.procedureCode || matched.serviceCode || proc.code;
      proc._mappedFromMaster = true; // Debug flag
    }
  }

  for (const med of medications) {
    if (!med.name) continue;
    
    const matched = findBestDrug(med.name);
    if (matched) {
      // For medications, normalize the name to the master data name to improve validator accuracy
      med.name = matched.itemName;
      if (matched.itemGenericName && !med.genericName) {
        med.genericName = matched.itemGenericName;
      }
      med._mappedFromMaster = true;
    }
  }

  return payload;
}

