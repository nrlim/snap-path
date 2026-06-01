import { validateDocumentCompleteness } from '@/lib/ai/validators/document';
import { validateDiagnosisTreatment } from '@/lib/ai/validators/diagnosis';
import { validateTariffPrice } from '@/lib/ai/validators/tariff';
import { checkDrugPrices } from '@/lib/ai/validators/drug-price';
import { generateClinicalPathway } from '@/lib/ai/generators/pathway';
import { validateLos } from '@/lib/ai/validators/los';
import { FatalError } from 'workflow';
import prisma from '@/lib/db';

export interface ClaimValidationPayload {
  jobId: string;
  payload: any;
}

/**
 * Updates job status in DB. Removed artificial delays — the Workflow SDK
 * provides durable step tracking and the client polls status independently.
 */
async function updateJobStatus(jobId: string, status: string) {
  await prisma.claimJob.update({
    where: { id: jobId },
    data: { status }
  });
}

function resolveEncounterType(payload: any): 'RAWAT_INAP' | 'RAWAT_JALAN' | 'IGD' {
  const raw = String(payload?.encounter?.type || payload?.encounter?.class?.code || '').toUpperCase();
  if (['RAWAT_INAP', 'INPATIENT', 'IMP', 'RI'].includes(raw)) return 'RAWAT_INAP';
  if (['RAWAT_JALAN', 'OUTPATIENT', 'AMB', 'RJ'].includes(raw)) return 'RAWAT_JALAN';
  if (['IGD', 'EMERGENCY', 'EMER', 'ER'].includes(raw)) return 'IGD';
  return 'RAWAT_INAP';
}

/**
 * Step 1: Initialize job and validate documents.
 * Updates job status to DOC_VAL.
 */
export async function initAndValidateDocStep(input: ClaimValidationPayload) {
  'use step';

  await prisma.claimJob.update({
    where: { id: input.jobId },
    data: { status: 'INIT', startedAt: new Date() },
  });

  await updateJobStatus(input.jobId, 'DOC_VAL');

  const result = await validateDocumentCompleteness(input.payload, input.jobId);
  return result;
}
initAndValidateDocStep.maxRetries = 1;

/**
 * Step 2: Validate diagnosis vs procedures using master data + AI.
 */
export async function validateDiagnosisStep(input: ClaimValidationPayload) {
  'use step';

  await updateJobStatus(input.jobId, 'DIAG_VAL');

  try {
    return await validateDiagnosisTreatment(input.payload, input.jobId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Auth failures are permanent, do not retry
    if (msg.includes('401') || msg.includes('403')) {
      throw new FatalError(`AI auth gagal (non-retryable): ${msg}`);
    }
    throw error;
  }
}
validateDiagnosisStep.maxRetries = 1;

/**
 * Step 3: Validate tariff prices against master tariff book.
 * This is a DB-only step, no AI involved — mark maxRetries=2.
 */
export async function validateTariffStep(input: ClaimValidationPayload) {
  'use step';

  await updateJobStatus(input.jobId, 'TARIFF_VAL');

  return await validateTariffPrice(
    {
      providerId: input.payload.providerId,
      encounterType: resolveEncounterType(input.payload),
      procedures: input.payload.procedures,
    },
    input.jobId,
  );
}
validateTariffStep.maxRetries = 2;

/**
 * Step 4: Check drug market prices (AI-assisted, with DB cache).
 * Returns null if no medications to check.
 */
export async function checkDrugPricesStep(input: ClaimValidationPayload) {
  'use step';

  await updateJobStatus(input.jobId, 'DRUG_VAL');

  if (!input.payload.medications || input.payload.medications.length === 0) {
    return null;
  }

  try {
    return await checkDrugPrices(
      {
        clientId: input.payload.clientId,
        providerId: input.payload.providerId,
        medications: input.payload.medications.map((m: any) => ({
          ...m,
          genericName: m.genericName || undefined,
          dosage: m.dosage || undefined,
        })),
      },
      input.jobId,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('401') || msg.includes('403')) {
      throw new FatalError(`AI auth gagal (non-retryable): ${msg}`);
    }
    throw error;
  }
}
checkDrugPricesStep.maxRetries = 1;

/**
 * Step 5: Generate clinical pathway based on primary diagnosis.
 * Returns null if no diagnoses.
 */
export async function generatePathwayStep(input: ClaimValidationPayload) {
  'use step';

  await updateJobStatus(input.jobId, 'PATHWAY_GEN');

  if (!input.payload.diagnoses || input.payload.diagnoses.length === 0) {
    return null;
  }

  const primaryDiag =
    input.payload.diagnoses.find((d: any) => String(d.type || '').toUpperCase() === 'PRIMARY') ||
    input.payload.diagnoses[0];

  try {
    return await generateClinicalPathway(
      {
        diagnosisCode: primaryDiag.code,
        diagnosisName: primaryDiag.description || primaryDiag.name,
        encounterType: resolveEncounterType(input.payload),
        providerId: input.payload.providerId,
        clientId: input.payload.clientId,
      },
      input.jobId,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Auth failures are permanent, do not retry
    if (msg.includes('401') || msg.includes('403')) {
      throw new FatalError(`AI auth gagal (non-retryable): ${msg}`);
    }
    // Abort/timeout should be retried by the workflow SDK (not swallowed)
    if (error instanceof Error && (error.name === 'AbortError' || msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout'))) {
      throw error;
    }
    // AI generation failures (schema validation, model errors) are non-critical —
    // the workflow still completes with partial results.
    console.error(`[generatePathwayStep] Pathway generation failed for ${primaryDiag.code}, continuing without pathway:`, error);
    return null;
  }
}
generatePathwayStep.maxRetries = 1;

/**
 * Step 5.5: Validate Length of Stay against Master Data & AI Research.
 */
export async function validateLosStep(input: ClaimValidationPayload) {
  'use step';

  await updateJobStatus(input.jobId, 'LOS_VAL');

  try {
    return await validateLos(input.payload, input.jobId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('401') || msg.includes('403')) {
      throw new FatalError(`AI auth gagal (non-retryable): ${msg}`);
    }
    throw error;
  }
}
validateLosStep.maxRetries = 1;

/**
 * Step 6: Aggregate all results and persist final output to DB.
 */
export async function aggregateAndSaveStep(
  input: ClaimValidationPayload,
  docRes: any,
  diagRes: any,
  tariffRes: any,
  drugRes: any,
  pathRes: any,
  losRes: any,
) {
  'use step';

  await updateJobStatus(input.jobId, 'AGGREGATE');

  let overallScore = 100;
  let status = 'VALID';

  const tariffItems = tariffRes?.items || [];
  const drugItems = drugRes?.items || [];
  const registeredTariffItems = tariffItems.filter((item: any) => item.status !== 'NOT_FOUND');
  const invalidRegisteredTariffItems = registeredTariffItems.filter((item: any) => item.status === 'OVER_THRESHOLD' || item.status === 'UNDER_PRICED');
  const invalidDrugItems = drugItems.filter((item: any) => item.status === 'OVER_THRESHOLD' || item.status === 'UNDER_PRICED' || item.status === 'NOT_FOUND');
  const hasUnregisteredTariff = tariffItems.some((item: any) => item.status === 'NOT_FOUND');
  const hasDrugReferenceUnavailable = drugItems.some((item: any) => item.status === 'NOT_FOUND');
  const tariffDeduction = registeredTariffItems.length > 0
    ? Math.min(20, Math.ceil((invalidRegisteredTariffItems.length / registeredTariffItems.length) * 20))
    : 0;
  const drugPriceDeduction = drugItems.length > 0
    ? Math.min(20, Math.ceil((invalidDrugItems.length / drugItems.length) * 20))
    : 0;
  
  const losDeduction = losRes?.deduction || 0;
  
  const missingDocumentCount = docRes?.details?.missingRequiredDocuments?.length || 0;
  const requiredDocumentCount =
    (docRes?.details?.providedDocuments?.length || 0) + missingDocumentCount || 6;
  const documentDeduction = missingDocumentCount > 0
    ? Math.min(10, Math.ceil((missingDocumentCount / requiredDocumentCount) * 10))
    : 0;
  const scoreBreakdown = {
    baseScore: 100,
    scoringModel: 'positive_points_v1',
    description: 'Setiap aspek menampilkan poin yang diperoleh dari bobot maksimum. Temuan validasi mengurangi poin aspek tersebut.',
    items: [
      { code: 'DIAGNOSIS_TREATMENT', label: 'Diagnosis, tindakan & obat klinis', maxDeduction: 25, maxScore: 25, score: 25, deducted: 0, status: 'PASS', reason: 'Diagnosis, tindakan, dan obat sesuai kebutuhan klinis utama.' },
      { code: 'TARIFF', label: 'Tarif tindakan terdaftar', maxDeduction: 20, maxScore: 20, score: 20, deducted: 0, status: 'PASS', reason: 'Item tindakan yang terdaftar berada dalam threshold master fee schedule.' },
      { code: 'DRUG_PRICE', label: 'Harga obat referensi internet', maxDeduction: 20, maxScore: 20, score: 20, deducted: 0, status: 'PASS', reason: 'Item obat yang memiliki referensi harga internet berada dalam threshold.' },
      { code: 'DOCUMENT', label: 'Kelengkapan dokumen', maxDeduction: 10, maxScore: 10, score: 10, deducted: 0, status: 'PASS', reason: 'Enam dokumen wajib klaim rawat inap sudah lengkap.' },
      { code: 'LOS', label: 'LOS compliance', maxDeduction: 10, maxScore: 10, score: 10, deducted: 0, status: 'PASS', reason: 'LOS aktual sesuai standar pathway.' },
      { code: 'UNREGISTERED_MASTER_DATA', label: 'Kesiapan master data', maxDeduction: 15, maxScore: 15, score: 15, deducted: 0, status: 'PASS', reason: 'Semua tindakan dan obat tersedia pada master data/referensi.' },
    ],
  };

  const diagnosisDetails = Array.isArray(diagRes?.details) ? diagRes.details : [];
  const diagnosisMissingRequiredCount = diagnosisDetails.reduce((total: number, detail: any) => total + (detail.missingRequiredProcedures?.length || 0), 0);
  const diagnosisIrrelevantCount = diagnosisDetails.reduce((total: number, detail: any) => total + (detail.irrelevantProcedures?.length || detail.unmatchedProcedures?.length || 0), 0);
  const diagnosisMedicationReviewCount = diagnosisDetails.reduce((total: number, detail: any) => total + (detail.medicationFindings?.filter((item: any) => item.status === 'REVIEW_NEEDED').length || 0), 0);
  const diagnosisMedicationInappropriateCount = diagnosisDetails.reduce((total: number, detail: any) => total + (detail.medicationFindings?.filter((item: any) => item.status === 'INAPPROPRIATE').length || 0), 0);
  const hasDiagnosisFindings = diagnosisMissingRequiredCount > 0 || diagnosisIrrelevantCount > 0 || diagnosisMedicationReviewCount > 0 || diagnosisMedicationInappropriateCount > 0;
  const diagnosisScore = typeof diagRes?.score === 'number' ? Math.max(0, Math.min(100, diagRes.score)) : (diagRes?.isValid ? 100 : 0);
  const diagnosisFindingDeduction = Math.min(25, (diagnosisMissingRequiredCount * 5) + (diagnosisIrrelevantCount * 2) + (diagnosisMedicationReviewCount * 1) + (diagnosisMedicationInappropriateCount * 3));
  const diagnosisScoreDeduction = hasDiagnosisFindings || !diagRes?.isValid
    ? Math.ceil(((100 - diagnosisScore) / 100) * 25)
    : 0;
  const diagnosisDeduction = Math.min(
    25,
    Math.max(
      !diagRes?.isValid ? 1 : 0,
      diagnosisScoreDeduction,
      diagnosisFindingDeduction,
    ),
  );

  if (diagnosisDeduction > 0) {
    overallScore -= diagnosisDeduction;
    scoreBreakdown.items[0].deducted = diagnosisDeduction;
    scoreBreakdown.items[0].reason = `Perlu review klinis: ${diagnosisMissingRequiredCount} prosedur wajib belum diklaim, ${diagnosisIrrelevantCount} tindakan perlu review relevansi, dan ${diagnosisMedicationReviewCount + diagnosisMedicationInappropriateCount} obat perlu review kesesuaian terhadap diagnosis.`;
    status = diagnosisDeduction >= 15 ? 'REVIEW_NEEDED' : 'WARNING';
  }
  if (tariffDeduction > 0) {
    overallScore -= tariffDeduction;
    scoreBreakdown.items[1].deducted = tariffDeduction;
    scoreBreakdown.items[1].reason = `${invalidRegisteredTariffItems.length}/${registeredTariffItems.length} item tindakan terdaftar tidak sesuai threshold master fee schedule. Pengurangan dihitung proporsional per item, bukan penuh 20 poin.`;
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }
  if (drugPriceDeduction > 0) {
    overallScore -= drugPriceDeduction;
    scoreBreakdown.items[2].deducted = drugPriceDeduction;
    scoreBreakdown.items[2].reason = hasDrugReferenceUnavailable
      ? `${invalidDrugItems.length}/${drugItems.length} item obat perlu review harga/referensi internet; sebagian referensi belum berhasil ditemukan. Pengurangan dihitung proporsional per item, bukan penuh 20 poin.`
      : `${invalidDrugItems.length}/${drugItems.length} item obat melewati threshold atau jauh di bawah referensi. Pengurangan dihitung proporsional per item, bukan penuh 20 poin.`;
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }
  if (!docRes.isValid) {
    overallScore -= documentDeduction;
    scoreBreakdown.items[3].deducted = documentDeduction;
    scoreBreakdown.items[3].reason = `Dokumen wajib belum lengkap (${missingDocumentCount}/${requiredDocumentCount} belum tersedia): ${docRes.details?.missingRequiredDocuments?.join(', ') || 'tidak diketahui'}.`;
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }
  if (losDeduction > 0) {
    overallScore -= losDeduction;
    scoreBreakdown.items[4].deducted = losDeduction;
    scoreBreakdown.items[4].reason = losRes?.reason || 'LOS tidak sesuai standar.';
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  } else if (losRes?.reason) {
    scoreBreakdown.items[4].reason = losRes.reason;
  }
  
  if (hasUnregisteredTariff) {
    overallScore -= 15;
    scoreBreakdown.items[5].deducted = 15;
    scoreBreakdown.items[5].reason = 'Ada tindakan yang belum tersedia di master tarif, sehingga belum bisa divalidasi harga.';
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }

  for (const item of scoreBreakdown.items) {
    item.score = Math.max(0, item.maxScore - item.deducted);
    item.status = item.deducted === 0 ? 'PASS' : item.score > 0 ? 'PARTIAL' : 'NEEDS_REVIEW';
  }

  overallScore = Math.max(0, overallScore);

  const jobTiming = await prisma.claimJob.findUnique({
    where: { id: input.jobId },
    select: { createdAt: true, startedAt: true },
  });
  const completedAt = new Date();
  const workflowStartedAt = jobTiming?.startedAt || jobTiming?.createdAt || completedAt;
  const totalDurationMs = Math.max(0, completedAt.getTime() - workflowStartedAt.getTime());

  const outputData = {
    jobId: input.jobId,
    status,
    overallScore,
    scoreBreakdown,
    summary: `Klaim berhasil divalidasi. Skor akhir: ${overallScore}/100.`,
    documentValidation: docRes,
    diagnosisValidation: diagRes,
    tariffValidation: tariffRes,
    drugPriceValidation: drugRes || { isValid: true, score: 100, items: [] },
    losValidation: losRes,
    clinicalPathway: pathRes
      ? {
          diagnosisCode: pathRes.diagnosisCode,
          adherenceScore: 100,
          estimatedLos: pathRes.estimatedLos,
          pathwayVersion: pathRes.pathwayVersion,
          generatedBy: pathRes.generatedBy,
          confidence: pathRes.confidence,
          recommendedPathway: pathRes.phases,
          deviations: [],
        }
      : undefined,
    processingTime: {
      total: totalDurationMs,
      totalMs: totalDurationMs,
      totalSeconds: Number((totalDurationMs / 1000).toFixed(2)),
      label: 'Latency 1x request clinical pathway',
      preProcessing: 0,
      mainProcessing: totalDurationMs,
      postProcessing: 0,
    },
    auditTrail: [{ step: 'WORKFLOW_SDK', timestamp: completedAt.toISOString(), status: 'SUCCESS' }],
  };

  await prisma.claimJob.update({
    where: { id: input.jobId },
    data: {
      status: 'COMPLETED',
      outputResult: outputData as any,
      completedAt,
    },
  });

  return outputData;
}
aggregateAndSaveStep.maxRetries = 2;
