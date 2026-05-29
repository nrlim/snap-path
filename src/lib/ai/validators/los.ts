import prisma from '@/lib/db';
import { getAIGateway } from '../gateway';
import { LosValidationOutput } from '../types';
import { resolveActualLosDays } from '@/lib/los';

export async function validateLos(payload: any, jobId: string): Promise<LosValidationOutput> {
  const actualLos = resolveActualLosDays(payload);
  
  const primaryDiag =
    payload.diagnoses?.find((d: any) => d.type === 'PRIMARY') ||
    payload.diagnoses?.[0];

  if (!primaryDiag) {
    return {
      jobId,
      source: "NOT_AVAILABLE",
      expectedLos: 0,
      actualLos,
      status: "NO_REFERENCE",
      varianceDays: 0,
      variancePct: 0,
      deduction: 0,
      reason: "Tidak ada diagnosa utama untuk menentukan standar LOS."
    };
  }

  const { code: diagnosisCode, name, description } = primaryDiag;
  const diagnosisName = description || name || "Unknown Diagnosis";
  const providerType = payload.providerType;

  // 1. Check for existing template in DB
  const existingPathways = await prisma.clinicalPathway.findMany({
    where: {
      diagnosisCode: diagnosisCode,
      isActive: true,
      OR: [
        { providerType: providerType || null },
        { providerType: null }
      ]
    },
    orderBy: {
      providerType: 'asc'
    }
  });

  let selectedTemplate = existingPathways.find(p => p.providerType === providerType);
  if (!selectedTemplate && existingPathways.length > 0) {
    selectedTemplate = existingPathways[0];
  }

  let expectedLos = 0;
  let minLos: number | undefined;
  let maxLos: number | undefined;
  let aiJustification: string | undefined;
  let references: string[] | undefined;
  let therapyRecommendation: LosValidationOutput['therapyRecommendation'] | undefined;
  let stayStatusThresholds: LosValidationOutput['stayStatusThresholds'] | undefined;
  let source: LosValidationOutput['source'] = "NOT_AVAILABLE";

  if (selectedTemplate && selectedTemplate.estimatedLos) {
    expectedLos = selectedTemplate.estimatedLos;
    source = "MASTER_DATA";
  } else {
    // 2. Fallback to AI estimation via deep research
    const gateway = await getAIGateway({ clientId: payload.clientId, providerId: payload.providerId, jobId });
    try {
      const { data } = await gateway.estimateDiagnosisLos(diagnosisCode, diagnosisName);
      expectedLos = data.estimatedLos;
      minLos = data.minLos;
      maxLos = data.maxLos;
      aiJustification = data.justification;
      references = data.references;
      therapyRecommendation = data.therapyRecommendation || null;
      stayStatusThresholds = data.stayStatusThresholds || null;
      source = "AI_ESTIMATE";
    } catch (error) {
      console.error(`Failed to estimate LOS via AI for ${diagnosisCode}:`, error);
      source = "NOT_AVAILABLE";
      expectedLos = 0;
    }
  }

  // Fetch threshold configuration — use AI-provided thresholds if available, else fall back to global config
  const config = await prisma.systemConfig.findUnique({
    where: { id: 'GLOBAL_CONFIG' }
  });
  const thresholdLosDays = stayStatusThresholds?.overstayDays ?? config?.thresholdLosDays ?? 1;
  const understayThresholdDays = stayStatusThresholds?.understayDays ?? 1;

  // Calculate Variance & Deduction
  const varianceDays = actualLos - expectedLos;
  const variancePct = expectedLos > 0 ? (varianceDays / expectedLos) * 100 : 0;
  
  let status: LosValidationOutput['status'] = "COMPLIANT";
  let deduction = 0;
  let reason = "LOS aktual sesuai standar pathway.";

  if (expectedLos > 0 && actualLos <= 0) {
    status = "MISSING_ACTUAL";
    deduction = 10;
    reason = `LOS aktual tidak diisi. Standar memberi estimasi ${expectedLos} hari, sehingga perlu dilengkapi.`;
  } else if (expectedLos <= 0) {
    status = "NO_REFERENCE";
    deduction = 0;
    reason = "Tidak ada standar referensi LOS untuk kasus ini.";
  } else if (varianceDays > thresholdLosDays) {
    status = "OVERSTAY";
    const overstayExceedingThreshold = varianceDays - thresholdLosDays;
    
    if (overstayExceedingThreshold <= 2) {
      deduction = 3;
      reason = `Overstay ${varianceDays} hari melebihi standar (${expectedLos} hari) dan batas toleransi (${thresholdLosDays} hari). Melebihi sedikit dari standar yang diharapkan.`;
    } else if (overstayExceedingThreshold <= 4) {
      deduction = 7;
      reason = `Overstay signifikan: ${varianceDays} hari di atas standar (${expectedLos} hari). Membutuhkan review urgensi klinis.`;
    } else {
      deduction = 10;
      reason = `Overstay melebihi batas kewajaran: ${varianceDays} hari di atas standar (${expectedLos} hari). Terindikasi inefisiensi yang sangat tinggi.`;
    }
  } else if (varianceDays < -understayThresholdDays) {
    status = "UNDERSTAY";
    if (variancePct <= -50) {
      deduction = 5;
      reason = `Understay signifikan: LOS aktual ${actualLos} hari, jauh lebih rendah dari standar (${expectedLos} hari, min ${minLos ?? '-'} hari). Perlu review karena dapat mengindikasikan pulang dini, readmission risk, atau kesalahan data.`;
    } else {
      deduction = 0;
      reason = `Understay ${Math.abs(varianceDays)} hari dari standar (${expectedLos} hari). Tidak ada pengurang skor, tetapi tetap ditandai untuk konteks klinis.`;
    }
  } else if (varianceDays < 0) {
    // Within understay threshold — still compliant but noted
    status = "COMPLIANT";
    deduction = 0;
    reason = `LOS aktual ${actualLos} hari masih dalam batas toleransi understay (${understayThresholdDays} hari) dari standar (${expectedLos} hari).`;
  } else if (varianceDays > 0 && varianceDays <= thresholdLosDays) {
    status = "COMPLIANT";
    deduction = 0;
    reason = `LOS aktual ${actualLos} hari masih dalam batas toleransi overstay (${thresholdLosDays} hari) dari standar (${expectedLos} hari).`;
  }

  return {
    jobId,
    source,
    expectedLos,
    minLos,
    maxLos,
    actualLos,
    status,
    varianceDays,
    variancePct,
    deduction,
    reason,
    aiJustification,
    references,
    therapyRecommendation,
    stayStatusThresholds,
  };
}
