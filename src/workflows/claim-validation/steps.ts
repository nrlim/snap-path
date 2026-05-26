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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function updateJobStatusAndDelay(jobId: string, status: string, delayMs = 1500) {
  await prisma.claimJob.update({
    where: { id: jobId },
    data: { status }
  });
  await delay(delayMs);
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
  await delay(1000);

  await updateJobStatusAndDelay(input.jobId, 'DOC_VAL', 2000);

  const result = await validateDocumentCompleteness(input.payload, input.jobId);
  return result;
}
initAndValidateDocStep.maxRetries = 1;

/**
 * Step 2: Validate diagnosis vs procedures using master data + AI.
 */
export async function validateDiagnosisStep(input: ClaimValidationPayload) {
  'use step';

  await updateJobStatusAndDelay(input.jobId, 'DIAG_VAL', 2500);

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

  await updateJobStatusAndDelay(input.jobId, 'TARIFF_VAL', 1500);

  return await validateTariffPrice(
    {
      providerId: input.payload.providerId,
      encounterType: input.payload.encounter.type,
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

  await updateJobStatusAndDelay(input.jobId, 'DRUG_VAL', 2000);

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

  await updateJobStatusAndDelay(input.jobId, 'PATHWAY_GEN', 2500);

  if (!input.payload.diagnoses || input.payload.diagnoses.length === 0) {
    return null;
  }

  const primaryDiag =
    input.payload.diagnoses.find((d: any) => d.type === 'PRIMARY') ||
    input.payload.diagnoses[0];

  try {
    return await generateClinicalPathway(
      {
        diagnosisCode: primaryDiag.code,
        diagnosisName: primaryDiag.description || primaryDiag.name,
        encounterType: input.payload.encounter.type,
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
    // AI generation failures (schema validation, timeout, model errors) are
    // non-critical — the workflow should still complete with partial results.
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

  await updateJobStatusAndDelay(input.jobId, 'LOS_VAL', 1500);

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

  await updateJobStatusAndDelay(input.jobId, 'AGGREGATE', 1000);

  let overallScore = 100;
  let status = 'VALID';

  const tariffItems = tariffRes?.items || [];
  const drugItems = drugRes?.items || [];
  const hasUnregisteredTariff = tariffItems.some((item: any) => item.status === 'NOT_FOUND');
  const hasUnregisteredDrug = drugItems.some((item: any) => item.status === 'NOT_FOUND');
  
  const losDeduction = losRes?.deduction || 0;
  
  const missingDocumentCount = docRes?.details?.missingRequiredDocuments?.length || 0;
  const requiredDocumentCount =
    (docRes?.details?.providedDocuments?.length || 0) + missingDocumentCount || 6;
  const documentDeduction = missingDocumentCount > 0
    ? Math.min(10, Math.ceil((missingDocumentCount / requiredDocumentCount) * 10))
    : 0;
  const scoreBreakdown = {
    baseScore: 100,
    items: [
      { code: 'DIAGNOSIS_TREATMENT', label: 'Diagnosis & tindakan klinis', maxDeduction: 25, deducted: 0, reason: 'Diagnosis dan tindakan sesuai kebutuhan klinis utama.' },
      { code: 'TARIFF', label: 'Tarif tindakan terdaftar', maxDeduction: 20, deducted: 0, reason: 'Item tindakan yang terdaftar berada dalam threshold master fee schedule.' },
      { code: 'DRUG_PRICE', label: 'Harga obat terdaftar', maxDeduction: 20, deducted: 0, reason: 'Item obat yang memiliki referensi harga berada dalam threshold.' },
      { code: 'DOCUMENT', label: 'Kelengkapan dokumen', maxDeduction: 10, deducted: 0, reason: 'Enam dokumen wajib klaim rawat inap sudah lengkap.' },
      { code: 'LOS', label: 'LOS compliance', maxDeduction: 10, deducted: 0, reason: 'LOS aktual sesuai standar pathway.' },
      { code: 'UNREGISTERED_MASTER_DATA', label: 'Kesiapan master data', maxDeduction: 15, deducted: 0, reason: 'Semua tindakan dan obat tersedia pada master data/referensi.' },
    ],
  };

  if (!diagRes.isValid) {
    overallScore -= 25;
    scoreBreakdown.items[0].deducted = 25;
    scoreBreakdown.items[0].reason = 'Diagnosis tidak sesuai tindakan, ada prosedur tidak relevan, atau prosedur wajib belum ada.';
    status = 'REVIEW_NEEDED';
  }
  if (tariffRes.status === 'WARNING' || tariffRes.status === 'INVALID') {
    overallScore -= 20;
    scoreBreakdown.items[1].deducted = 20;
    scoreBreakdown.items[1].reason = 'Ada item tindakan terdaftar yang melewati threshold master fee schedule.';
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }
  if (drugRes && (drugRes.status === 'WARNING' || drugRes.status === 'INVALID')) {
    overallScore -= 20;
    scoreBreakdown.items[2].deducted = 20;
    scoreBreakdown.items[2].reason = 'Ada item obat terdaftar yang melewati threshold market reference.';
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
  
  if (hasUnregisteredTariff || hasUnregisteredDrug) {
    overallScore -= 15;
    scoreBreakdown.items[5].deducted = 15;
    scoreBreakdown.items[5].reason = `${hasUnregisteredTariff ? 'Ada tindakan yang belum tersedia di master tarif, sehingga belum bisa divalidasi harga. ' : ''}${hasUnregisteredDrug ? 'Ada obat yang belum ditemukan pada referensi harga, sehingga belum bisa divalidasi harga.' : ''}`.trim();
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
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
