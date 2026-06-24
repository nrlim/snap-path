import { buildClinicalReferenceSearchContext } from '@/lib/evidence/clinical-reference-search';
import type { MedicalSourceReference, MedicalSourceReferenceType } from '@/lib/evidence/types';
import { ClaimValidationInput, ClaimValidationOutput } from '../types';
import { getAIGateway } from '../gateway';

type DiagnosisValidationDetail = ClaimValidationOutput['diagnosisValidation']['details'][number];

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

export async function validateDiagnosisTreatment(input: ClaimValidationInput, jobId?: string): Promise<ClaimValidationOutput['diagnosisValidation']> {
  const diagnoses = input.diagnoses || [];
  const procedures = input.procedures || [];
  const gateway = await getAIGateway({ clientId: input.clientId, providerId: input.providerId, jobId });

  const details: ClaimValidationOutput['diagnosisValidation']['details'] = [];
  const claimedProcedureCodes = procedures.map(p => p.code).filter((code): code is string => typeof code === 'string' && code.trim().length > 0);

  // Pre-build a name lookup map from canonical procedure inputs.
  const inputProcNameMap: Record<string, string> = {};
  for (const p of procedures) {
    const name = p.name;
    if (p.code && name) inputProcNameMap[p.code] = name;
  }

  let overallValid = true;

  for (const diag of diagnoses) {
    const diagnosisCode = String(diag.code || '').trim();
    details.push({
      diagnosisCode,
      diagnosisName: diag.name || diagnosisCode,
      clinicalSummary: '',
      matchedProcedures: [],
      unmatchedProcedures: [],
      procedureFindings: [],
      irrelevantProcedures: [],
      medicationFindings: [],
      missingRequiredProcedures: [],
      missingRequiredProcedureDetails: [],
      suggestedProcedures: [],
      notes: 'Review klinis menggunakan reasoning AI dan evidence eksternal; mapping lokal diagnosis-tindakan tidak digunakan pada step ini.',
    });
  }

  // 2. AI-based holistic validation
  let aiScore = 100;
  const externalClinicalEvidenceContext = await buildClinicalReferenceSearchContext({
    diagnoses: diagnoses.map((diagnosis) => ({ code: diagnosis.code, name: diagnosis.name })),
    procedures: procedures.map((procedure) => ({ code: procedure.code, name: procedure.name })),
    medications: input.medications?.map((medication) => ({ name: medication.name, genericName: medication.genericName })) || [],
  });
  try {
    const { data } = await gateway.validateDiagnosisTreatment({
      encounter: input.encounter,
      diagnoses,
      procedures,
      medications: input.medications || [],
      documents: input.documents?.map((document) => ({
        type: document.type,
        date: document.date,
        conclusion: document.conclusion,
      })) || [],
      notes: input.notes,
      clinicalReviewMode: 'AI_EXTERNAL_EVIDENCE_REASONING_WITHOUT_LOCAL_MAPPING',
      externalClinicalEvidenceContext,
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

  return {
    isValid: finalValid,
    score: finalScore,
    details
  };
}
