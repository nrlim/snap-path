import { validateDocumentCompleteness } from '@/lib/ai/validators/document';
import { validateDiagnosisTreatment } from '@/lib/ai/validators/diagnosis';
import { validateTariffPrice } from '@/lib/ai/validators/tariff';
import { checkDrugPrices } from '@/lib/ai/validators/drug-price';
import { generateClinicalPathway } from '@/lib/ai/generators/pathway';
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
    return await validateDiagnosisTreatment(input.payload);
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
generatePathwayStep.maxRetries = 1;

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
) {
  'use step';

  await updateJobStatusAndDelay(input.jobId, 'AGGREGATE', 1000);

  let overallScore = 100;
  let status = 'VALID';

  if (!diagRes.isValid) {
    overallScore -= 30;
    status = 'REVIEW_NEEDED';
  }
  if (tariffRes.status === 'WARNING' || tariffRes.status === 'INVALID') {
    overallScore -= 20;
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }
  if (drugRes && (drugRes.status === 'WARNING' || drugRes.status === 'INVALID')) {
    overallScore -= 20;
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }
  if (!docRes.isValid) {
    overallScore -= 10;
    if (status !== 'REVIEW_NEEDED') status = 'WARNING';
  }

  const outputData = {
    jobId: input.jobId,
    status,
    overallScore,
    summary: `Klaim berhasil divalidasi. Skor akhir: ${overallScore}/100.`,
    documentValidation: docRes,
    diagnosisValidation: diagRes,
    tariffValidation: tariffRes,
    drugPriceValidation: drugRes || { isValid: true, score: 100, items: [] },
    clinicalPathway: pathRes
      ? {
          diagnosisCode: pathRes.diagnosisCode,
          adherenceScore: 100,
          recommendedPathway: pathRes.phases,
          deviations: [],
        }
      : undefined,
    processingTime: { total: 0, preProcessing: 0, mainProcessing: 0, postProcessing: 0 },
    auditTrail: [{ step: 'WORKFLOW_SDK', timestamp: new Date().toISOString(), status: 'SUCCESS' }],
  };

  await prisma.claimJob.update({
    where: { id: input.jobId },
    data: {
      status: 'COMPLETED',
      outputResult: outputData as any,
      completedAt: new Date(),
    },
  });

  return outputData;
}
aggregateAndSaveStep.maxRetries = 2;
