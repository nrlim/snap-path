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
 * Step 4: Check medical item prices using local master data and a controlled AI resolver.
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
        diagnoses: input.payload.diagnoses,
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
  
  // Non-Medication items are explicitly excluded from scoring logic:
  const scorableDrugItems = drugItems.filter((item: any) => item.status !== 'NON_MEDICATION');
  const invalidDrugItems = scorableDrugItems.filter((item: any) => item.status === 'OVER_THRESHOLD' || item.status === 'UNDER_PRICED');
  const unregisteredTariffItems = tariffItems.filter((item: any) => item.status === 'NOT_FOUND');
  const drugReferenceUnavailableItems = scorableDrugItems.filter((item: any) => item.status === 'NOT_FOUND');
  const masterDataItemCount = tariffItems.length + scorableDrugItems.length;
  const missingMasterDataCount = unregisteredTariffItems.length + drugReferenceUnavailableItems.length;
  const masterDataDeduction = masterDataItemCount > 0
    ? Math.min(15, Math.ceil((missingMasterDataCount / masterDataItemCount) * 15))
    : 0;
  
  const tariffDeduction = registeredTariffItems.length > 0
    ? Math.min(20, Math.ceil((invalidRegisteredTariffItems.length / registeredTariffItems.length) * 20))
    : 0;
  const drugPriceDeduction = scorableDrugItems.length > 0
    ? Math.min(20, Math.ceil((invalidDrugItems.length / scorableDrugItems.length) * 20))
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
      { code: 'DRUG_PRICE', label: 'Harga obat/farmalkes referensi master', maxDeduction: 20, maxScore: 20, score: 20, deducted: 0, status: 'PASS', reason: 'Item obat/farmalkes yang memiliki referensi master berada dalam threshold.' },
      { code: 'DOCUMENT', label: 'Kelengkapan dokumen', maxDeduction: 10, maxScore: 10, score: 10, deducted: 0, status: 'PASS', reason: 'Enam dokumen wajib klaim rawat inap sudah lengkap.' },
      { code: 'LOS', label: 'LOS compliance', maxDeduction: 10, maxScore: 10, score: 10, deducted: 0, status: 'PASS', reason: 'LOS aktual sesuai standar pathway.' },
      { code: 'UNREGISTERED_MASTER_DATA', label: 'Kesiapan master data', maxDeduction: 15, maxScore: 15, score: 15, deducted: 0, status: 'PASS', reason: 'Semua tindakan dan obat tersedia pada master data/referensi.' },
    ],
  };

  const diagnosisDetails = Array.isArray(diagRes?.details) ? diagRes.details : [];
  const claimedProcedureCount = Array.isArray(input.payload?.procedures) ? input.payload.procedures.length : 0;
  const claimedMedicationCount = Array.isArray(input.payload?.medications) ? input.payload.medications.length : 0;
  const uniqueMissingRequired = new Set<string>();
  const uniqueIrrelevantProcedures = new Set<string>();
  const uniqueReviewMedications = new Set<string>();
  const uniqueInappropriateMedications = new Set<string>();

  for (const detail of diagnosisDetails) {
    for (const item of detail.missingRequiredProcedures || []) uniqueMissingRequired.add(String(item));
    for (const item of detail.irrelevantProcedures || []) uniqueIrrelevantProcedures.add(String(item.procedureCode || item.procedureName || item));
    for (const item of detail.unmatchedProcedures || []) uniqueIrrelevantProcedures.add(String(item));
    for (const item of detail.medicationFindings || []) {
      const key = String(item.medicationName || item.name || item.genericName || '').trim().toLowerCase();
      if (!key) continue;
      if (item.status === 'INAPPROPRIATE') uniqueInappropriateMedications.add(key);
      else if (item.status === 'REVIEW_NEEDED') uniqueReviewMedications.add(key);
    }
  }

  const diagnosisMissingRequiredCount = uniqueMissingRequired.size;
  const diagnosisIrrelevantCount = uniqueIrrelevantProcedures.size;
  const diagnosisMedicationReviewCount = uniqueReviewMedications.size;
  const diagnosisMedicationInappropriateCount = uniqueInappropriateMedications.size;
  const hasDiagnosisFindings = diagnosisMissingRequiredCount > 0 || diagnosisIrrelevantCount > 0 || diagnosisMedicationReviewCount > 0 || diagnosisMedicationInappropriateCount > 0;

  // Clinical relevance deduction is proportional to the claim items being reviewed,
  // not a flat full deduction. This prevents a few findings from consuming all 25 points.
  const missingRequiredWeight = 8;
  const procedureRelevanceWeight = 8;
  const medicationRelevanceWeight = 9;
  const missingRequiredDenominator = claimedProcedureCount + diagnosisMissingRequiredCount;
  const missingRequiredDeduction = missingRequiredDenominator > 0
    ? (diagnosisMissingRequiredCount / missingRequiredDenominator) * missingRequiredWeight
    : 0;
  const procedureRelevanceDeduction = claimedProcedureCount > 0
    ? (diagnosisIrrelevantCount / claimedProcedureCount) * procedureRelevanceWeight
    : (diagnosisIrrelevantCount > 0 ? procedureRelevanceWeight : 0);
  const weightedMedicationFindingCount = (diagnosisMedicationReviewCount * 0.5) + diagnosisMedicationInappropriateCount;
  const medicationRelevanceDeduction = claimedMedicationCount > 0
    ? (weightedMedicationFindingCount / claimedMedicationCount) * medicationRelevanceWeight
    : (weightedMedicationFindingCount > 0 ? medicationRelevanceWeight : 0);
  const diagnosisDeduction = hasDiagnosisFindings
    ? Math.min(25, Math.ceil(missingRequiredDeduction + procedureRelevanceDeduction + medicationRelevanceDeduction))
    : 0;

  if (diagnosisDeduction > 0) {
    overallScore -= diagnosisDeduction;
    scoreBreakdown.items[0].deducted = diagnosisDeduction;
    scoreBreakdown.items[0].reason = `Perlu review klinis: ${diagnosisMissingRequiredCount} prosedur wajib belum diklaim, ${diagnosisIrrelevantCount}/${claimedProcedureCount || 0} tindakan perlu review relevansi, dan ${diagnosisMedicationReviewCount + diagnosisMedicationInappropriateCount}/${claimedMedicationCount || 0} obat perlu review kesesuaian terhadap diagnosis. Pengurangan dihitung proporsional terhadap total tindakan dan obat yang diinput, bukan penuh 25 poin.`;
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
    scoreBreakdown.items[2].reason = `${invalidDrugItems.length}/${scorableDrugItems.length} item obat/farmalkes melewati threshold atau jauh di bawah referensi master. Pengurangan dihitung proporsional per item, bukan penuh 20 poin.`;
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
  
  if (masterDataDeduction > 0) {
    overallScore -= masterDataDeduction;
    scoreBreakdown.items[5].deducted = masterDataDeduction;
    scoreBreakdown.items[5].reason = `${missingMasterDataCount}/${masterDataItemCount} item tindakan/obat belum tersedia pada master data/referensi lokal (${unregisteredTariffItems.length} tindakan, ${drugReferenceUnavailableItems.length} obat/farmalkes). Pengurangan dihitung proporsional dari bobot 15 poin, bukan penuh.`;
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
