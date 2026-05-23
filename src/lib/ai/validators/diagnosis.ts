import prisma from '@/lib/db';
import { ClaimValidationInput, ClaimValidationOutput } from '../types';
import { getAIGateway } from '../gateway';

export async function validateDiagnosisTreatment(input: ClaimValidationInput, jobId?: string): Promise<ClaimValidationOutput['diagnosisValidation']> {
  const { diagnoses, procedures } = input;
  const gateway = await getAIGateway({ clientId: input.clientId, providerId: input.providerId, jobId });

  const details: ClaimValidationOutput['diagnosisValidation']['details'] = [];
  const claimedProcedureCodes = procedures.map(p => p.code);

  // Pre-build a name lookup map from procedures in input (may have names)
  const inputProcNameMap: Record<string, string> = {};
  for (const p of procedures) {
    if (p.code && ((p as any).name || p.description)) inputProcNameMap[p.code] = (p as any).name || p.description;
  }

  let overallValid = true;

  for (const diag of diagnoses) {
    // 1. Rule-based check against master data
    const mapEntries = await prisma.diagnosisProcedureMap.findMany({
      where: {
        diagnosis: { icdCode: diag.code }
      }
    });

    const missingRequiredProcedures: string[] = [];

    // Check which required procedures are missing
    const requiredCodes = mapEntries.filter(m => m.isRequired).map(m => m.procedureCode);
    for (const req of requiredCodes) {
      if (!claimedProcedureCodes.includes(req)) {
        // Try to get name from tariff master
        const tariffEntry = await prisma.tariffEntry.findFirst({
          where: { procedureCode: req },
          select: { procedureName: true }
        });
        missingRequiredProcedures.push(
          tariffEntry?.procedureName ? `${req} — ${tariffEntry.procedureName}` : req
        );
        overallValid = false;
      }
    }

    const mappedCodes = mapEntries.map(m => m.procedureCode);

    // Build matched/unmatched with names
    const matchedWithNames = claimedProcedureCodes
      .filter(c => mappedCodes.includes(c))
      .map(c => inputProcNameMap[c] ? `${c} — ${inputProcNameMap[c]}` : c);
    const unmatchedWithNames = claimedProcedureCodes
      .filter(c => !mappedCodes.includes(c))
      .map(c => inputProcNameMap[c] ? `${c} — ${inputProcNameMap[c]}` : c);

    details.push({
      diagnosisCode: diag.code,
      diagnosisName: (diag as any).name || diag.description || diag.code,
      clinicalSummary: '',
      matchedProcedures: matchedWithNames,
      unmatchedProcedures: unmatchedWithNames,
      missingRequiredProcedures,
      suggestedProcedures: [],
      notes: ''
    });
  }

  // 2. AI-based holistic validation
  let aiScore = 100;
  try {
    const { data } = await gateway.validateDiagnosisTreatment(input);
    aiScore = data.score;
    overallValid = overallValid && data.isValid;

    // Merge AI insights with rule-based details
    for (const aiDetail of data.details) {
      const existing = details.find(d => d.diagnosisCode === aiDetail.diagnosisCode);
      if (existing) {
        existing.notes = aiDetail.notes;
        if (aiDetail.diagnosisName) existing.diagnosisName = aiDetail.diagnosisName;
        if (aiDetail.clinicalSummary) existing.clinicalSummary = aiDetail.clinicalSummary;
        if (aiDetail.suggestedProcedures?.length) existing.suggestedProcedures = aiDetail.suggestedProcedures;
        // Merge missing procedures AI caught that DB didn't
        for (const missing of aiDetail.missingRequiredProcedures || []) {
          if (!existing.missingRequiredProcedures.includes(missing)) {
            existing.missingRequiredProcedures.push(missing);
          }
        }
      }
    }
  } catch (error) {
    console.error("AI diagnosis validation failed:", error);
    aiScore = overallValid ? 80 : 50;
  }

  return {
    isValid: overallValid,
    score: aiScore,
    details
  };
}
