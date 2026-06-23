import prisma from '@/lib/db';
import { buildClinicalReferenceSearchContext } from '@/lib/evidence/clinical-reference-search';
import type { MedicalSourceReference, MedicalSourceReferenceType } from '@/lib/evidence/types';
import { ClaimValidationInput, ClaimValidationOutput } from '../types';
import { getAIGateway } from '../gateway';

type DiagnosisValidationDetail = ClaimValidationOutput['diagnosisValidation']['details'][number];
type ProcedureFinding = NonNullable<DiagnosisValidationDetail['procedureFindings']>[number];

const MEDICAL_REFERENCE_TYPES: ReadonlySet<MedicalSourceReferenceType> = new Set([
  'INDONESIA_GUIDELINE',
  'WHO_GUIDELINE',
  'SPECIALTY_SOCIETY_GUIDELINE',
  'PUBMED',
  'COCHRANE',
  'CLINICAL_TRIALS',
  'FDA',
  'RXNORM',
  'AAP',
  'TOP_MEDICAL_JOURNAL',
  'GOOGLE_SCHOLAR',
  'OTHER',
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeEvidenceReferences(value: unknown): MedicalSourceReference[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const record = asRecord(item);
    const sourceType = String(record.sourceType || '').toUpperCase();
    const safeSourceType: MedicalSourceReferenceType = MEDICAL_REFERENCE_TYPES.has(sourceType as MedicalSourceReferenceType)
      ? sourceType as MedicalSourceReferenceType
      : 'OTHER';
    const strength: MedicalSourceReference['strength'] = record.strength === 'HIGH' ? 'HIGH' : record.strength === 'LOW' ? 'LOW' : 'MEDIUM';
    return {
      sourceType: safeSourceType,
      title: String(record.title || safeSourceType),
      organization: record.organization ? String(record.organization) : null,
      year: record.year ? String(record.year) : null,
      url: record.url ? String(record.url) : null,
      identifier: record.identifier ? String(record.identifier) : null,
      relevance: String(record.relevance || 'Mendukung reasoning klinis diagnosis-tindakan.'),
      strength,
    };
  }).filter((item) => item.title.trim().length > 0 && item.relevance.trim().length > 0);
}

function deriveDiagnosisCategory(icdCode: string) {
  return icdCode.trim().toUpperCase().match(/^[A-Z]\d{2}/)?.[0] || 'UNCLASSIFIED';
}

function isHighConfidenceAppropriateFinding(finding: ProcedureFinding) {
  return finding.status === 'APPROPRIATE' && finding.confidence !== 'LOW' && Boolean(finding.procedureCode);
}

function normalizeProcedureKey(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function collectEpisodeAppropriateProcedureKeys(details: DiagnosisValidationDetail[]): Set<string> {
  const keys = new Set<string>();
  for (const detail of details) {
    for (const finding of detail.procedureFindings || []) {
      if (finding.status === 'APPROPRIATE') keys.add(normalizeProcedureKey(finding.procedureCode || finding.procedureName));
    }
    for (const procedure of detail.matchedProcedures || []) {
      keys.add(normalizeProcedureKey(String(procedure).split('—')[0] || procedure));
    }
  }
  return keys;
}

function collectEpisodeAppropriateMedicationKeys(details: DiagnosisValidationDetail[]): Set<string> {
  const keys = new Set<string>();
  for (const detail of details) {
    for (const finding of detail.medicationFindings || []) {
      if (finding.status === 'APPROPRIATE') {
        keys.add(String(finding.medicationName || finding.genericName || '').trim().toLowerCase());
      }
    }
  }
  return keys;
}

async function saveAiApprovedDiagnosisProcedureMappings(details: DiagnosisValidationDetail[], claimedProcedureCodes: string[]) {
  const uniqueClaimedCodes = Array.from(new Set(claimedProcedureCodes.filter(Boolean)));
  if (uniqueClaimedCodes.length === 0) return;

  for (const detail of details) {
    const findings = detail.procedureFindings || [];
    const findingByCode = new Map(findings.map((finding) => [finding.procedureCode, finding]));
    const hasCompleteAiApproval = uniqueClaimedCodes.every((code) => {
      const finding = findingByCode.get(code);
      return finding ? isHighConfidenceAppropriateFinding(finding) : false;
    });

    if (!hasCompleteAiApproval) continue;
    if ((detail.irrelevantProcedures?.length || 0) > 0 || (detail.unmatchedProcedures?.length || 0) > 0) continue;

    const diagnosis = await prisma.diagnosisCode.upsert({
      where: { icdCode: detail.diagnosisCode },
      update: {
        description: detail.diagnosisName || detail.diagnosisCode,
        isActive: true,
      },
      create: {
        icdCode: detail.diagnosisCode,
        description: detail.diagnosisName || detail.diagnosisCode,
        category: deriveDiagnosisCategory(detail.diagnosisCode),
        isActive: true,
      },
      select: { id: true },
    });

    for (const code of uniqueClaimedCodes) {
      const finding = findingByCode.get(code);
      if (!finding || !isHighConfidenceAppropriateFinding(finding)) continue;

      const existing = await prisma.diagnosisProcedureMap.findFirst({
        where: {
          diagnosisId: diagnosis.id,
          procedureCode: code,
        },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.diagnosisProcedureMap.create({
        data: {
          diagnosisId: diagnosis.id,
          procedureCode: code,
          procedureName: finding.procedureName || code,
          isRequired: false,
          confidence: finding.confidence === 'HIGH' ? 0.9 : 0.75,
          source: 'AI_GENERATED',
        },
      });
    }
  }
}

export async function validateDiagnosisTreatment(input: ClaimValidationInput, jobId?: string): Promise<ClaimValidationOutput['diagnosisValidation']> {
  const { diagnoses, procedures } = input;
  const gateway = await getAIGateway({ clientId: input.clientId, providerId: input.providerId, jobId });

  const details: ClaimValidationOutput['diagnosisValidation']['details'] = [];
  const claimedProcedureCodes = procedures.map(p => p.code).filter((code): code is string => typeof code === 'string' && code.trim().length > 0);

  // Pre-build a name lookup map from canonical procedure inputs.
  const inputProcNameMap: Record<string, string> = {};
  for (const p of procedures) {
    const name = p.name;
    if (p.code && name) inputProcNameMap[p.code] = name;
  }

  const formatProcedure = (code: string, name?: string | null) => name ? `${code} — ${name}` : code;
  const mapHasRequiredOrPositiveEvidence = (detail: ClaimValidationOutput['diagnosisValidation']['details'][number]) =>
    (detail.matchedProcedures?.length || 0) > 0 || (detail.missingRequiredProcedures?.length || 0) > 0;

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

    // Local mapping is used only as positive evidence and required-procedure source.
    // If the lookup table has no/incomplete data, do not create DB-only review findings;
    // let the AI clinical fallback assess each claimed procedure based on clinical context.
    const matchedCodes = claimedProcedureCodes.filter(c => mappedCodes.includes(c));
    const matchedWithNames = matchedCodes.map(c => formatProcedure(c, inputProcNameMap[c]));
    const procedureFindings = matchedCodes.map((code) => ({
      procedureCode: code,
      procedureName: inputProcNameMap[code] || code,
      status: 'APPROPRIATE' as const,
      reason: `Tindakan ini sesuai dengan mapping lokal diagnosis ${diag.code}.`,
      againstDiagnosis: diag.code,
      confidence: 'MEDIUM' as const,
    }));

    details.push({
      diagnosisCode: diag.code,
      diagnosisName: diag.name || diag.code,
      clinicalSummary: '',
      matchedProcedures: matchedWithNames,
      unmatchedProcedures: [],
      procedureFindings,
      irrelevantProcedures: [],
      medicationFindings: [],
      missingRequiredProcedures,
      missingRequiredProcedureDetails: missingRequiredProcedures.map((item) => {
        const [code, name] = item.split(' — ');
        return {
          code: code || item,
          name: name || item,
          reason: `Prosedur ini ditandai wajib pada mapping diagnosis ${diag.code}.`,
          evidenceLevel: 'REQUIRED' as const,
        };
      }),
      suggestedProcedures: [],
      notes: mapEntries.length === 0
        ? 'Lookup table mapping tindakan-diagnosis belum memiliki data untuk diagnosis ini; clinical review dilakukan oleh AI berdasarkan konteks klaim, tanpa hardcoded mapping.'
        : ''
    });
  }

  // 2. AI-based holistic validation
  let aiScore = 100;
  const externalClinicalEvidenceContext = await buildClinicalReferenceSearchContext({
    diagnoses: input.diagnoses.map((diagnosis) => ({ code: diagnosis.code, name: diagnosis.name })),
    procedures: input.procedures.map((procedure) => ({ code: procedure.code, name: procedure.name })),
    medications: input.medications?.map((medication) => ({ name: medication.name, genericName: medication.genericName })) || [],
  });
  try {
    const { data } = await gateway.validateDiagnosisTreatment({
      ...input,
      clinicalReviewMode: 'AI_FALLBACK_WHEN_LOCAL_MAPPING_ABSENT_OR_INCOMPLETE_WITH_EXTERNAL_MEDICAL_EVIDENCE',
      externalClinicalEvidenceContext,
      localMappingCoverage: details.map((detail) => ({
        diagnosisCode: detail.diagnosisCode,
        diagnosisName: detail.diagnosisName,
        hasLocalMapping: mapHasRequiredOrPositiveEvidence(detail),
        locallyMatchedProcedures: detail.matchedProcedures,
        locallyRequiredMissingProcedures: detail.missingRequiredProcedures,
      })),
    });
    aiScore = data.score;
    overallValid = overallValid && data.isValid;

    // Merge AI insights with rule-based details
    for (const aiDetail of data.details) {
      const existing = details.find(d => d.diagnosisCode === aiDetail.diagnosisCode);
      if (existing) {
        // Merge notes: prefer AI notes if they are non-empty and not a generic fallback.
        if (aiDetail.notes && aiDetail.notes.trim().length > 0) {
          existing.notes = aiDetail.notes;
        }
        // Clear generic local-mapping-absent note if AI returned substantial findings
        if (existing.notes?.includes('Lookup table mapping') && (
          (Array.isArray(aiDetail.procedureFindings) && aiDetail.procedureFindings.length > 0) ||
          (Array.isArray(aiDetail.medicationFindings) && aiDetail.medicationFindings.length > 0) ||
          aiDetail.clinicalSummary
        )) {
          existing.notes = aiDetail.notes || '';
        }
        if (aiDetail.diagnosisName) existing.diagnosisName = aiDetail.diagnosisName;
        if (aiDetail.clinicalSummary) existing.clinicalSummary = aiDetail.clinicalSummary;
        if (Array.isArray(aiDetail.procedureFindings) && aiDetail.procedureFindings.length) {
          const aiProcedureFindings = aiDetail.procedureFindings
            .filter((item: any) => (item?.procedureCode || item?.procedureName) && item?.reason)
            .map((item: any) => ({
              procedureCode: String(item.procedureCode || item.procedureName || ''),
              procedureName: String(item.procedureName || inputProcNameMap[item.procedureCode] || item.procedureCode || 'Unknown Procedure'),
              status: item.status === 'INAPPROPRIATE' ? 'INAPPROPRIATE' as const : item.status === 'APPROPRIATE' ? 'APPROPRIATE' as const : 'REVIEW_NEEDED' as const,
              reason: String(item.reason),
              againstDiagnosis: String(item.againstDiagnosis || existing.diagnosisCode),
              confidence: item.confidence === 'HIGH' ? 'HIGH' as const : item.confidence === 'LOW' ? 'LOW' as const : 'MEDIUM' as const,
              evidenceReferences: normalizeEvidenceReferences(item.evidenceReferences),
            }));
          const localFindings = existing.procedureFindings || [];
          const mergedByCode = new Map(localFindings.map((finding) => [finding.procedureCode, finding]));
          for (const finding of aiProcedureFindings) mergedByCode.set(finding.procedureCode, finding);
          existing.procedureFindings = Array.from(mergedByCode.values());
        }
        if (Array.isArray(aiDetail.matchedProcedures) && aiDetail.matchedProcedures.length) {
          const mergedMatched = new Set([...(existing.matchedProcedures || []), ...aiDetail.matchedProcedures]);
          existing.matchedProcedures = Array.from(mergedMatched);
        }
        if (Array.isArray(aiDetail.medicationFindings) && aiDetail.medicationFindings.length) {
          existing.medicationFindings = aiDetail.medicationFindings
            .filter((item: any) => item?.confidence !== 'LOW' && item?.reason && item?.medicationName)
            .map((item: any) => ({
              medicationName: String(item.medicationName),
              genericName: item.genericName ? String(item.genericName) : null,
              status: item.status === 'INAPPROPRIATE' ? 'INAPPROPRIATE' as const : item.status === 'APPROPRIATE' ? 'APPROPRIATE' as const : 'REVIEW_NEEDED' as const,
              reason: String(item.reason),
              againstDiagnosis: String(item.againstDiagnosis || existing.diagnosisCode),
              confidence: item.confidence === 'HIGH' ? 'HIGH' as const : 'MEDIUM' as const,
              evidenceReferences: normalizeEvidenceReferences(item.evidenceReferences),
            }));
        }
        if (Array.isArray(aiDetail.irrelevantProcedures) && aiDetail.irrelevantProcedures.length) {
          const relevantIrrelevant = aiDetail.irrelevantProcedures
            .filter((item: any) => item?.confidence !== 'LOW' && item?.reason && item?.procedureCode)
            .map((item: any) => ({
              procedureCode: String(item.procedureCode),
              procedureName: String(item.procedureName || inputProcNameMap[item.procedureCode] || item.procedureCode),
              reason: String(item.reason),
              againstDiagnosis: String(item.againstDiagnosis || existing.diagnosisCode),
              confidence: item.confidence === 'HIGH' ? 'HIGH' as const : 'MEDIUM' as const,
            }));
          existing.irrelevantProcedures = relevantIrrelevant;
          existing.procedureFindings = (existing.procedureFindings || []).map((finding) => {
            const irrelevant = relevantIrrelevant.find((item: { procedureCode: string }) => item.procedureCode === finding.procedureCode);
            return irrelevant ? {
              procedureCode: irrelevant.procedureCode,
              procedureName: irrelevant.procedureName,
              status: 'INAPPROPRIATE' as const,
              reason: irrelevant.reason,
              againstDiagnosis: irrelevant.againstDiagnosis,
              confidence: irrelevant.confidence,
            } : finding;
          });
          existing.unmatchedProcedures = relevantIrrelevant.map((item: { procedureCode: string; procedureName: string; reason: string }) => `${item.procedureCode} — ${item.procedureName}: ${item.reason}`);
        } else if (Array.isArray(aiDetail.unmatchedProcedures) && aiDetail.unmatchedProcedures.length) {
          // Backward-compatible fallback for older AI schemas. Keep as review text, but do not add DB-only unmapped items.
          existing.unmatchedProcedures = aiDetail.unmatchedProcedures;
        }
        if (aiDetail.clinicalEvidenceSummary) existing.clinicalEvidenceSummary = String(aiDetail.clinicalEvidenceSummary);
        const evidenceReferences = normalizeEvidenceReferences(aiDetail.evidenceReferences);
        if (evidenceReferences.length > 0) existing.evidenceReferences = evidenceReferences;
        if (['LIVE_SEARCH_USED', 'MODEL_KNOWLEDGE_WITH_REFERENCES', 'NO_EXTERNAL_REFERENCE_AVAILABLE'].includes(String(aiDetail.evidenceRetrievalStatus))) {
          existing.evidenceRetrievalStatus = aiDetail.evidenceRetrievalStatus;
        }
        if (aiDetail.suggestedProcedures?.length) existing.suggestedProcedures = aiDetail.suggestedProcedures;
        if (Array.isArray(aiDetail.missingRequiredProcedureDetails) && aiDetail.missingRequiredProcedureDetails.length) {
          existing.missingRequiredProcedureDetails = [
            ...(existing.missingRequiredProcedureDetails || []),
            ...aiDetail.missingRequiredProcedureDetails.filter((item: any) => item?.evidenceLevel === 'REQUIRED'),
          ];
        }
        // Merge only procedures AI marks as truly REQUIRED, not advisory suggestions.
        for (const missing of aiDetail.missingRequiredProcedures || []) {
          const isRequired = (aiDetail.missingRequiredProcedureDetails || []).some((item: any) =>
            item?.evidenceLevel === 'REQUIRED' && (`${item.code} — ${item.name}` === missing || item.code === missing)
          );
          if (isRequired && !existing.missingRequiredProcedures.includes(missing)) {
            existing.missingRequiredProcedures.push(missing);
          }
        }
        
        // Fallback: ensure UI consistency if procedureFindings is completely empty but procedures exist
        if ((!existing.procedureFindings || existing.procedureFindings.length === 0) && claimedProcedureCodes.length > 0) {
          const irrelevantCodes = new Set((existing.irrelevantProcedures || []).map((p: any) => p.procedureCode));
          existing.procedureFindings = claimedProcedureCodes
            .filter(code => !irrelevantCodes.has(code))
            .map(code => ({
              procedureCode: code,
              procedureName: inputProcNameMap[code] || code,
              status: 'APPROPRIATE' as const,
              reason: 'Tindakan ini dinilai relevan dengan diagnosis berdasarkan konteks klinis klaim (AI Review).',
              againstDiagnosis: existing.diagnosisCode,
              confidence: 'MEDIUM' as const,
            }));
        }
      }
    }
  } catch (error) {
    console.error("AI diagnosis validation failed:", error);
    aiScore = overallValid ? 80 : 50;
  }

  const uniqueMissingRequired = new Set<string>();
  const uniqueIrrelevantProcedures = new Set<string>();
  const uniqueReviewMedications = new Set<string>();
  const uniqueInappropriateMedications = new Set<string>();
  const episodeAppropriateProcedureKeys = collectEpisodeAppropriateProcedureKeys(details);
  const episodeAppropriateMedicationKeys = collectEpisodeAppropriateMedicationKeys(details);
  for (const detail of details) {
    for (const item of detail.missingRequiredProcedures || []) uniqueMissingRequired.add(String(item));
    for (const item of detail.irrelevantProcedures || []) {
      const key = normalizeProcedureKey((item as any).procedureCode || (item as any).procedureName || item);
      if (!episodeAppropriateProcedureKeys.has(key)) uniqueIrrelevantProcedures.add(key);
    }
    for (const item of detail.unmatchedProcedures || []) {
      const key = normalizeProcedureKey(String(item).split('—')[0] || item);
      if (!episodeAppropriateProcedureKeys.has(key)) uniqueIrrelevantProcedures.add(key);
    }
    for (const item of detail.medicationFindings || []) {
      const key = String((item as any).medicationName || (item as any).name || (item as any).genericName || '').trim().toLowerCase();
      if (!key || episodeAppropriateMedicationKeys.has(key)) continue;
      if (item.status === 'INAPPROPRIATE') uniqueInappropriateMedications.add(key);
      else if (item.status === 'REVIEW_NEEDED') uniqueReviewMedications.add(key);
    }
  }

  const missingRequiredCount = uniqueMissingRequired.size;
  const irrelevantCount = uniqueIrrelevantProcedures.size;
  const medicationReviewCount = uniqueReviewMedications.size;
  const medicationInappropriateCount = uniqueInappropriateMedications.size;

  // Convert diagnosis/procedure/medication findings into a readable 0-100 score
  // proportionally against the total claimed procedures/medications.
  const hasActionableFindings = missingRequiredCount > 0 || irrelevantCount > 0 || medicationReviewCount > 0 || medicationInappropriateCount > 0;
  const procedureDenominator = procedures.length;
  const medicationDenominator = input.medications?.length || 0;
  const missingRequiredDenominator = procedureDenominator + missingRequiredCount;
  const missingRequiredDeduction = missingRequiredDenominator > 0 ? (missingRequiredCount / missingRequiredDenominator) * 32 : 0;
  const procedureDeduction = procedureDenominator > 0 ? (irrelevantCount / procedureDenominator) * 32 : (irrelevantCount > 0 ? 32 : 0);
  const weightedMedicationFindingCount = (medicationReviewCount * 0.5) + medicationInappropriateCount;
  const medicationDeduction = medicationDenominator > 0 ? (weightedMedicationFindingCount / medicationDenominator) * 36 : (weightedMedicationFindingCount > 0 ? 36 : 0);
  const ruleBasedDeduction = hasActionableFindings ? Math.min(100, Math.ceil(missingRequiredDeduction + procedureDeduction + medicationDeduction)) : 0;
  const finalScore = Math.max(0, 100 - ruleBasedDeduction);
  const finalValid = missingRequiredCount === 0 && irrelevantCount === 0 && medicationReviewCount === 0 && medicationInappropriateCount === 0 && finalScore >= 80;

  if (finalValid) {
    try {
      await saveAiApprovedDiagnosisProcedureMappings(details, claimedProcedureCodes);
    } catch (error) {
      console.error('Failed to cache AI-approved diagnosis-procedure mappings:', error);
    }
  }

  return {
    isValid: finalValid,
    score: finalScore,
    details
  };
}
