import { generateText, generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { AIGatewayDriver, AIMessage, Usage } from '../gateway';

function stripJsonMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1).trim();
  return trimmed;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

function toAssessmentArray(value: unknown): Array<{ name: string; frequency: string; mandatory: boolean }> {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string'
      ? { name: item, frequency: 'Sesuai kondisi klinis', mandatory: true }
      : {
        name: String((item as any)?.name || (item as any)?.assessment || 'Assessment'),
        frequency: String((item as any)?.frequency || 'Sesuai kondisi klinis'),
        mandatory: Boolean((item as any)?.mandatory ?? true),
      });
  }
  return toStringArray(value).map((name) => ({ name, frequency: 'Sesuai kondisi klinis', mandatory: true }));
}

function toTreatmentArray(value: unknown): Array<{ name: string; route: string | null; mandatory: boolean }> {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string'
      ? { name: item, route: null, mandatory: true }
      : {
        name: String((item as any)?.name || (item as any)?.treatment || 'Treatment'),
        route: (item as any)?.route ? String((item as any).route) : null,
        mandatory: Boolean((item as any)?.mandatory ?? true),
      });
  }
  return toStringArray(value).map((name) => ({ name, route: null, mandatory: true }));
}

function toMedicationArray(value: unknown, instruction?: unknown): Array<{ name: string; dosage: string; frequency: string; route: string; duration: string; mandatory: boolean }> {
  const source = Array.isArray(value) && value.length > 0 ? value : toStringArray(instruction);
  if (Array.isArray(source)) {
    return source.map((item) => typeof item === 'string'
      ? { name: item, dosage: '-', frequency: 'Sesuai instruksi dokter', route: '-', duration: 'Selama perawatan', mandatory: false }
      : {
        name: String((item as any)?.name || (item as any)?.medication || 'Medication'),
        dosage: String((item as any)?.dosage || '-'),
        frequency: String((item as any)?.frequency || 'Sesuai instruksi dokter'),
        route: String((item as any)?.route || '-'),
        duration: String((item as any)?.duration || 'Selama perawatan'),
        mandatory: Boolean((item as any)?.mandatory ?? false),
      });
  }
  return [];
}

function toNursingArray(value: unknown): Array<{ activity: string; frequency: string }> {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string'
      ? { activity: item, frequency: 'Tiap shift' }
      : { activity: String((item as any)?.activity || (item as any)?.name || 'Nursing activity'), frequency: String((item as any)?.frequency || 'Tiap shift') });
  }
  return toStringArray(value).map((activity) => ({ activity, frequency: 'Tiap shift' }));
}

function toNutrition(value: unknown): { diet: string; restrictions: string[] | null } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nutrition = value as Record<string, unknown>;
    return {
      diet: String(nutrition.diet || nutrition.name || 'Diet sesuai kondisi klinis'),
      restrictions: Array.isArray(nutrition.restrictions) ? nutrition.restrictions.map(String) : null,
    };
  }
  return { diet: String(value || 'Diet sesuai kondisi klinis'), restrictions: null };
}

function toDischargeGate(value: unknown, criteriaFallback?: unknown): { criteria: string[]; mustMeetAll: boolean } | null {
  const source = value ?? criteriaFallback;
  if (source === null || source === undefined || source === false) return null;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const gate = source as Record<string, unknown>;
    return { criteria: toStringArray(gate.criteria), mustMeetAll: Boolean(gate.mustMeetAll ?? true) };
  }
  return { criteria: toStringArray(source), mustMeetAll: true };
}

function getRepairTextInput(input: string | { text: string }): string {
  return typeof input === 'string' ? input : input.text;
}

async function repairJsonOnlyText(input: string | { text: string }): Promise<string | null> {
  try {
    return JSON.stringify(JSON.parse(stripJsonMarkdownFence(getRepairTextInput(input))));
  } catch {
    return null;
  }
}

function extractFirstNumber(pattern: RegExp, text: string): number | null {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function repairDiagnosisLosJsonText(input: string | { text: string }): Promise<string | null> {
  const text = getRepairTextInput(input);
  const json = await repairJsonOnlyText(text);
  if (json) return json;

  const normalized = text.replace(/\r/g, '').trim();
  const estimatedLos =
    extractFirstNumber(/(?:Typical LOS|standard expected LOS|expected LOS|LOS)\D{0,40}(\d+)\s*(?:days?|hari)/i, normalized) ??
    extractFirstNumber(/(\d+)\s*(?:days?|hari)\s*\(\s*range/i, normalized) ??
    extractFirstNumber(/(\d+)\s*[-–]\s*\d+\s*(?:days?|hari)/i, normalized) ??
    3;
  const minLos =
    extractFirstNumber(/(?:Minimum|minLos|min)\D{0,40}(\d+)\s*(?:days?|hari)/i, normalized) ??
    extractFirstNumber(/range\s*(\d+)\s*[-–]/i, normalized) ??
    Math.max(1, estimatedLos - 1);
  const maxLos =
    extractFirstNumber(/(?:Maximum|maxLos|max)\D{0,40}(\d+)\s*(?:days?|hari)/i, normalized) ??
    extractFirstNumber(/range\s*\d+\s*[-–]\s*(\d+)/i, normalized) ??
    Math.max(estimatedLos, estimatedLos + 1);

  const references = normalized
    .split('\n')
    .map((line) => line.replace(/^[-*#\s|]+/, '').trim())
    .filter((line) => /Kemenkes|WHO|PNPK|PAPDI|IDAI|guideline|pedoman|consensus/i.test(line))
    .slice(0, 5);

  return JSON.stringify({
    estimatedLos,
    minLos,
    maxLos,
    justification: normalized.replace(/```(?:json)?/gi, '').replace(/```/g, '').slice(0, 1800),
    references: references.length > 0 ? references : ['General clinical consensus'],
  });
}

async function repairClinicalPathwayJsonText(text: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(stripJsonMarkdownFence(text));
    if (!parsed || typeof parsed !== 'object') return null;
    const root = parsed as Record<string, unknown>;
    const phases = Array.isArray(root.phases) ? root.phases : [];
    const repaired = {
      estimatedLos: Number(root.estimatedLos || root.estimated_los || Math.max(1, phases.length || 1)),
      phases: phases.map((phase, index) => {
        const p = (phase && typeof phase === 'object') ? phase as Record<string, unknown> : {};
        return {
          phaseId: String(p.phaseId || p.phase_id || `phase-${index + 1}`),
          phaseName: String(p.phaseName || p.phase_name || `Fase ${index + 1}`),
          dayRange: String(p.dayRange || p.day_range || `Day ${index + 1}`),
          objectives: toStringArray(p.objectives),
          assessments: toAssessmentArray(p.assessments),
          treatments: toTreatmentArray(p.treatments),
          medications: toMedicationArray(p.medications, p.medicationInstructions),
          nursing: toNursingArray(p.nursing),
          nutrition: toNutrition(p.nutrition),
          education: toStringArray(p.education),
          dischargeGate: toDischargeGate(p.dischargeGate, p.dischargeCriteria),
        };
      }),
    };
    return JSON.stringify(repaired);
  } catch {
    return null;
  }
}

export class OpenAICompatibleAIDriver implements AIGatewayDriver {
  private ai: ReturnType<typeof createOpenAI>;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(apiKey: string, baseURL: string, model: string, maxTokens?: number, temperature?: number) {
    this.ai = createOpenAI({
      apiKey,
      baseURL,
    });
    this.defaultModel = model;
    this.maxTokens = maxTokens || 1500;
    this.temperature = temperature ?? 0.7;
  }

  async generateText(prompt: string, context?: AIMessage[]): Promise<{ text: string; usage?: Usage }> {
    const messages = (context || []).map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    if (prompt) {
      messages.push({ role: "user", content: prompt });
    }

    const { text, usage } = await generateText({
      model: this.ai(this.defaultModel),
      messages: messages as any,
      temperature: this.temperature,
    });

    return { text, usage: usage as any };
  }

  async extractMedicalData(clinicalText: string): Promise<{ data: Record<string, unknown>; usage?: Usage }> {
    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema: z.record(z.string(), z.unknown()), // Generic fallback, but you should use specific schemas for real data
      prompt: `Extract structured medical entities from the following text:\n\n${clinicalText}`,
      temperature: this.temperature,
      experimental_repairText: repairJsonOnlyText,
    });

    return { data: object, usage: usage as any };
  }

  async validateDiagnosisTreatment(payload: any): Promise<{ data: any; usage?: Usage }> {
    const evidenceReferenceSchema = z.object({
      sourceType: z.enum([
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
      ]),
      title: z.string().describe('Specific source title. Do not invent article titles; use source family/organization title if exact title is unavailable.'),
      organization: z.string().nullable(),
      year: z.string().nullable(),
      url: z.string().nullable().describe('Official URL when available from live search. Null if not retrieved.'),
      identifier: z.string().nullable().describe('PMID, DOI, NCT, guideline id, NDC/RxCUI, or null.'),
      relevance: z.string().describe('Why this source supports the diagnosis-procedure or diagnosis-medication reasoning.'),
      strength: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    });

    const schema = z.object({
      isValid: z.boolean(),
      score: z.number().min(0).max(100),
      details: z.array(z.object({
        diagnosisCode: z.string(),
        diagnosisName: z.string().describe('Human-readable name of the diagnosis'),
        clinicalSummary: z.string().describe('Brief 1 sentence clinical summary for admission context'),
        matchedProcedures: z.array(z.string()).describe('Claimed procedures that are clinically relevant to this diagnosis. Include code and name when available.'),
        unmatchedProcedures: z.array(z.string()).describe('Only claimed procedures that are clearly irrelevant after clinical reasoning. Do not include procedures merely because they are absent from local mapping.'),
        procedureFindings: z.array(z.object({
          procedureCode: z.string(),
          procedureName: z.string(),
          status: z.enum(['APPROPRIATE', 'REVIEW_NEEDED', 'INAPPROPRIATE']),
          reason: z.string().describe('One concise sentence explaining clinical rationale, procedure purpose, and claim context'),
          againstDiagnosis: z.string().describe('Diagnosis/code being assessed'),
          confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Use HIGH only when the relationship is clear from standard clinical practice or clearly unrelated'),
          evidenceReferences: z.array(evidenceReferenceSchema).nullable().describe('External medical references used for this specific diagnosis-procedure finding, when available.')
        })).describe('One finding for every claimed procedure against this diagnosis. Use REVIEW_NEEDED when clinical context is insufficient.'),
        irrelevantProcedures: z.array(z.object({
          procedureCode: z.string(),
          procedureName: z.string(),
          reason: z.string().describe('Specific reason why this procedure is not clinically related'),
          againstDiagnosis: z.string().describe('Diagnosis/code being assessed'),
          confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Use HIGH only when clearly irrelevant')
        })).describe('Detailed irrelevant procedure findings. Empty if uncertain.'),
        medicationFindings: z.array(z.object({
          medicationName: z.string(),
          genericName: z.string().nullable(),
          status: z.enum(['APPROPRIATE', 'REVIEW_NEEDED', 'INAPPROPRIATE']),
          reason: z.string().describe('One concise sentence explaining whether the medication matches this diagnosis'),
          againstDiagnosis: z.string().describe('Diagnosis/code being assessed'),
          confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          evidenceReferences: z.array(evidenceReferenceSchema).nullable().describe('External medical references used for this diagnosis-medication finding, when available.')
        })).describe('Medication appropriateness findings against this diagnosis. Use REVIEW_NEEDED if indication depends on comorbidity, symptom, lab, or route context.'),
        missingRequiredProcedures: z.array(z.string()),
        missingRequiredProcedureDetails: z.array(z.object({
          code: z.string(),
          name: z.string(),
          reason: z.string().describe('Why this procedure is expected for the diagnosis/pathway'),
          evidenceLevel: z.enum(['REQUIRED', 'COMMON', 'OPTIONAL']).describe('REQUIRED only when standard pathway strongly requires it')
        })),
        suggestedProcedures: z.array(z.object({
          code: z.string().describe('Procedure code e.g. ICD-9 or local code'),
          name: z.string().describe('Human-readable procedure name'),
          rationale: z.string().describe('Why this procedure is relevant to the diagnosis'),
          evidenceLevel: z.enum(['COMMON', 'OPTIONAL']).describe('Suggested procedures are not mandatory; use COMMON or OPTIONAL only')
        })).describe('Procedures relevant to this diagnosis that were NOT claimed, AI-suggested for admission review'),
        clinicalEvidenceSummary: z.string().nullable().describe('Short source-backed rationale for the diagnosis-procedure review.'),
        evidenceReferences: z.array(evidenceReferenceSchema).nullable().describe('Best references supporting this diagnosis review.'),
        evidenceRetrievalStatus: z.enum(['LIVE_SEARCH_USED', 'MODEL_KNOWLEDGE_WITH_REFERENCES', 'NO_EXTERNAL_REFERENCE_AVAILABLE']).nullable(),
        notes: z.string()
      }))
    });

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      prompt: `Return ONLY raw JSON matching the schema. Do not use markdown.

You are a senior clinical pathway reviewer for healthcare claims across multiple clients and payer/provider configurations. Your task is to perform a clinically sound fallback review when local diagnosis-procedure mapping is absent or incomplete.

CLAIM PAYLOAD:
${JSON.stringify(payload, null, 2)}

If externalClinicalEvidenceContext is present in the payload, use it as pre-fetched official/reference context for diagnosis-procedure reasoning. Do not treat absence of articles as evidence of inappropriateness.

CORE PRINCIPLES:
1. Do NOT use hardcoded diagnosis-procedure mappings. Base your review on clinical reasoning, standard pathway logic, reputable medical references, and the actual claim context only.
2. Local lookup/mapping data, if present in the payload, is supporting evidence only. If it is absent/empty/incomplete, perform direct AI clinical review; absence from mapping is NEVER evidence of non-compliance.
3. Support multiple diagnoses. Return one detail object for EVERY diagnosis in the claim, preserving diagnosis code, name, type, and sequence context where available.
4. Assess every CLAIMED procedure against the full episode first, then explain its relationship to each relevant diagnosis. A procedure that is appropriate for one diagnosis/comorbidity/complication should not be treated as an episode-level inconsistency merely because it is not tied to another diagnosis.
5. Assess every CLAIMED procedure against every relevant diagnosis using the procedure name, code, encounter type, admission context, medications, documents, LOS/outcome notes, and common inpatient workflow.
6. Consider broad legitimate relationships: diagnostic workup, therapeutic treatment, monitoring, nursing/supportive care, admission/administrative care, labs, imaging, surgery/anesthesia, rehabilitation, discharge planning, and complication/comorbidity management.
7. Mark a procedure APPROPRIATE when there is a plausible clinical or operational relationship to the diagnosis/admission.
8. Mark REVIEW_NEEDED when the procedure could be appropriate but depends on missing clinical context such as symptoms, severity, lab/imaging results, procedure notes, comorbidity, complication, route, or timing.
9. Mark INAPPROPRIATE only when the procedure is clearly unrelated to the whole episode and cannot be justified by the primary diagnosis, secondary diagnoses, complications, admission workflow, or documented medication/document context. Use HIGH confidence only for clearly unrelated cases.
10. Do not penalize local hospital procedure codes, uncommon names, bundled services, or non-standard code systems. Use the description/name as the main semantic signal when code systems are local.
11. Missing required procedures must be conservative. Use REQUIRED only when a standard pathway strongly requires the item for safe care in this encounter. Common/optional items should go to suggestedProcedures, not missingRequiredProcedures.
12. Medication findings should include supportive therapy, symptom control, antibiotics, fluids, chronic medication continuation, prophylaxis, and comorbidity context. Use REVIEW_NEEDED if indication depends on undocumented context.

EXTERNAL MEDICAL EVIDENCE EXCEPTION FOR DIAGNOSIS-PROCEDURE REASONING:
- This exception applies ONLY to clinical diagnosis/procedure/medication reasoning. It does NOT apply to tariff, drug pricing, policy, FWA, document, or payable calculation.
- CRITICAL: You have been provided with real, live-fetched external medical evidence in \`externalClinicalEvidenceContext.queries[].sources[]\`.
- You MUST actively read and utilize the snippets provided in these sources (e.g., PubMed abstracts, FDA drug labels (indikasi, kontraindikasi), RxNorm nomenclatures, WHO indicators).
- When validating a medication, strictly check if its FDA indications or PubMed literature support its use for the given diagnosis.
- When validating a procedure, check if the PubMed abstracts or WHO guidelines mention it as a valid diagnostic/therapeutic step for the condition.
- Preferred source hierarchy, inspired by the medical-mcp source architecture: Indonesian Kemenkes/PNPK/Formularium/internal clinical guideline when available; WHO or specialty society guidelines; Cochrane/systematic reviews; PubMed indexed guideline/review/clinical study; top medical journals such as NEJM/JAMA/Lancet/BMJ/Nature Medicine; FDA/RxNorm only for drug nomenclature/safety; AAP for pediatric claims.
- Do not invent PMID, DOI, URL, guideline titles, publication years, or organizations. USE EXACTLY what is provided in the \`externalClinicalEvidenceContext\`. If exact identifiers are not available, keep identifier/url null and cite the source family/organization honestly.
- For every INAPPROPRIATE finding with MEDIUM/HIGH confidence and every REQUIRED missing procedure, include at least one evidence reference whenever available.
- For APPROPRIATE findings, include concise references when they materially support the relation, but do not over-cite routine inpatient workflow. Include the reasoning in the \`reason\` field based on the FDA/PubMed/WHO evidence.
- Set evidenceRetrievalStatus to LIVE_SEARCH_USED if actual provider search/retrieval was used OR if externalClinicalEvidenceContext contains pre-fetched PubMed/reference results that you used; otherwise use MODEL_KNOWLEDGE_WITH_REFERENCES when relying on model-known reputable sources, or NO_EXTERNAL_REFERENCE_AVAILABLE if no reliable reference can be cited.

OUTPUT REQUIREMENTS PER DIAGNOSIS:
- details length must equal the number of claim diagnoses.
- procedureFindings: CRITICAL: YOU MUST INCLUDE EVERY SINGLE CLAIMED PROCEDURE HERE, EVEN IF IT IS 'APPROPRIATE'. Do not omit matching procedures. We need the clinical 'reason' for why it matches.
- medicationFindings: CRITICAL: YOU MUST INCLUDE EVERY SINGLE CLAIMED MEDICATION HERE, EVEN IF IT IS 'APPROPRIATE'. Do not omit matching medications.
- matchedProcedures: include procedures assessed as APPROPRIATE (note: they must ALSO be detailed in procedureFindings).
- unmatchedProcedures and irrelevantProcedures: include only procedures assessed as INAPPROPRIATE with MEDIUM/HIGH confidence.
- missingRequiredProcedures: include only REQUIRED items; do not put COMMON/OPTIONAL suggestions here.
- suggestedProcedures: advisory only, never mandatory. Provide procedures or medications that would be strongly recommended for this diagnosis.
- clinicalEvidenceSummary: one concise sentence summarizing the strongest medical-source rationale.
- evidenceReferences: include only the strongest 1-2 references used for this diagnosis review.
- notes: one concise sentence summarizing review rationale, evidence status, and missing context.
- isValid should be false only when there is at least one true REQUIRED missing item, one clearly INAPPROPRIATE procedure/medication with MEDIUM/HIGH confidence, or other material clinical inconsistency.
- score should reflect severity: keep high scores for plausible care with context gaps; reduce more for clear unrelated procedures or missing required critical care.

Be conservative and clinically precise: false irrelevant flags are harmful. If uncertain, choose REVIEW_NEEDED with a concrete reason instead of INAPPROPRIATE.`,
      temperature: Math.min(this.temperature, 0.2),
    });

    return { data: object, usage: usage as any };
  }

  async searchDrugMarketPrice(): Promise<{ data: any; usage?: Usage }> {
    throw new Error('AI market price lookup is disabled. Medication pricing must use local MedicalItemPriceMaster data only.');
  }

  async searchDrugMarketPriceBatch(): Promise<{ data: any[]; usage?: Usage }> {
    throw new Error('AI market price lookup is disabled. Medication pricing must use local MedicalItemPriceMaster data only.');
  }

  async resolveMedicalItemMatch(input: { medication: any; diagnoses: any[]; candidates: any[] }): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      selectedCandidateId: z.string().nullable().describe('Candidate id selected from the provided candidates only, or null if no safe match.'),
      confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      reason: z.string().describe('Brief clinical and product-matching rationale. Do not mention external sources.'),
    });

    const compactCandidates = input.candidates.slice(0, 20).map((candidate: any) => ({
      id: candidate.id,
      itemName: candidate.itemName,
      itemGenericName: candidate.itemGenericName,
      itemTypeCode: candidate.itemTypeCode,
      itemTypeName: candidate.itemTypeName,
      itemGroup: candidate.itemGroup,
      dosageForm: candidate.itemTypeName,
      marketPriceMax: candidate.marketPriceMax,
      source: Array.isArray(candidate.sources) ? String(candidate.sources[0] || '').slice(0, 500) : '',
    }));

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      system: `You are a conservative clinical pharmacy master-data matcher. You do NOT search external sources and you do NOT estimate prices. Your only task is to choose the best matching item from the provided local MedicalItemPriceMaster candidates.

Rules:
1. Select only candidate.id from the provided candidates. Never invent ids or products.
2. Use diagnosis context only to avoid clinically implausible matches, not to force a match.
3. Match by brand/generic name, active ingredient, strength/concentration, route, dosage form, and package volume when available.
4. Prefer exact/near-exact brand or product-name matches over generic alternatives when both exist.
5. Never match solely because dosage/strength/package numbers are similar. Example: PAMOL 500 MG TABLET must not resolve to PRIMEXA 500 unless brand/generic ingredient evidence also matches safely.
6. If the medication is ambiguous, different strength/volume, or no candidate is safe, return selectedCandidateId: null with LOW confidence.
7. Prefer HIGH confidence only for exact or near-exact product/ingredient + strength/form matches.`, 
      prompt: `Medication to resolve:\n${JSON.stringify(input.medication, null, 2)}\n\nDiagnosis context:\n${JSON.stringify(input.diagnoses || [], null, 2)}\n\nLocal master candidates:\n${JSON.stringify(compactCandidates, null, 2)}`,
      temperature: 0,
    });

    return { data: object, usage: usage as any };
  }

  async resolveMedicalItemMatches(input: { requests: Array<{ requestId: string; medication: any; candidates: any[] }>; diagnoses: any[] }): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      matches: z.array(z.object({
        requestId: z.string().describe('requestId from the input request.'),
        selectedCandidateId: z.string().nullable().describe('Candidate id selected from that request candidates only, or null if no safe match.'),
        confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        reason: z.string().describe('Brief product-matching rationale. Do not mention external sources.'),
      })),
    });

    const compactRequests = input.requests.slice(0, 12).map((request) => ({
      requestId: request.requestId,
      medication: {
        name: request.medication?.name,
        genericName: request.medication?.genericName,
        dosage: request.medication?.dosage,
        frequency: request.medication?.frequency,
        duration: request.medication?.duration,
      },
      candidates: request.candidates.slice(0, 20).map((candidate: any) => ({
        id: candidate.id,
        itemName: candidate.itemName,
        itemGenericName: candidate.itemGenericName,
        itemTypeCode: candidate.itemTypeCode,
        itemTypeName: candidate.itemTypeName,
        itemGroup: candidate.itemGroup,
      })),
    }));

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      system: `You are a conservative clinical pharmacy master-data matcher. You do NOT search external sources and you do NOT estimate prices. Your only task is to choose the best matching item from each request's provided local MedicalItemPriceMaster candidates.

Rules:
1. Return exactly one match object per requestId.
2. Select only candidate.id from the same request. Never invent ids or products.
3. Use diagnosis context only to avoid clinically implausible matches, not to force a match.
4. Match by brand/generic name, active ingredient, strength/concentration, route, dosage form, and package volume when available.
5. Prefer exact/near-exact brand or product-name matches over generic alternatives when both exist.
6. Never match solely because dosage/strength/package numbers are similar. Example: PAMOL 500 MG TABLET must not resolve to PRIMEXA 500 unless brand/generic ingredient evidence also matches safely.
7. If one request is ambiguous, different strength/volume, or no candidate is safe, return selectedCandidateId: null with LOW confidence for that request only.
8. Prefer HIGH confidence only for exact or near-exact product/ingredient + strength/form matches.`,
      prompt: `Diagnosis context: ${JSON.stringify(input.diagnoses || [])}\n\nRequests: ${JSON.stringify(compactRequests)}`,
      temperature: 0,
    });

    return { data: object, usage: usage as any };
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string, diagnosisContext?: Array<{ code: string; name?: string; type?: string; sequence?: number }>): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      estimatedLos: z.number(),
      phases: z.array(z.object({
        phaseId: z.string(),
        phaseName: z.string(),
        dayRange: z.string(),
        objectives: z.array(z.string()),
        assessments: z.array(z.object({ name: z.string(), frequency: z.string(), mandatory: z.boolean() })),
        treatments: z.array(z.object({ name: z.string(), route: z.string().nullable(), mandatory: z.boolean() })),
        medications: z.array(z.object({ name: z.string(), dosage: z.string(), frequency: z.string(), route: z.string(), duration: z.string(), mandatory: z.boolean() })),
        nursing: z.array(z.object({ activity: z.string(), frequency: z.string() })),
        nutrition: z.object({ diet: z.string(), restrictions: z.array(z.string()).nullable() }),
        education: z.array(z.string()),
        dischargeGate: z.object({ criteria: z.array(z.string()), mustMeetAll: z.boolean() }).nullable()
      }))
    });

    // Clinical pathway output is a nested multi-phase object. Keep the request
    // bounded so the workflow can continue, and allocate enough output budget to
    // avoid truncated structured JSON from OpenAI-compatible providers.
    const maxOutputTokens = Math.max(this.maxTokens, 4500);
    const timeout = 25_000;
    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      schemaName: 'ClinicalPathwayGenerationResult',
      schemaDescription: 'A clinical pathway object. Return raw JSON only. Do not wrap in markdown fences.',
      maxOutputTokens,
      timeout,
      experimental_repairText: async ({ text }) => repairClinicalPathwayJsonText(text),
      prompt: `Generate a realistic clinical pathway for ${diagnosisCode} - ${diagnosisName} suitable for Indonesian healthcare context.

Diagnosis context for this claim episode:
${JSON.stringify(diagnosisContext && diagnosisContext.length > 0 ? diagnosisContext : [{ code: diagnosisCode, name: diagnosisName, type: 'PRIMARY', sequence: 1 }], null, 2)}

OUTPUT FORMAT RULES:
- Return ONLY raw JSON. Do not use markdown. Do not wrap the answer in \`\`\`json fences.
- Every phase must include phaseId, phaseName, dayRange, objectives, assessments, treatments, medications, nursing, nutrition, education, and dischargeGate.
- objectives and education must be arrays of strings, not a single string.
- assessments must be an array of { "name": string, "frequency": string, "mandatory": boolean }.
- treatments must be an array of { "name": string, "route": string | null, "mandatory": boolean }.
- medications must be an array of { "name": string, "dosage": string, "frequency": string, "route": string, "duration": string, "mandatory": boolean }.
- nursing must be an array of { "activity": string, "frequency": string }.
- nutrition must be { "diet": string, "restrictions": string[] | null }.
- dischargeGate must be null or { "criteria": string[], "mustMeetAll": boolean }. Do not use dischargeCriteria.

Clinical context:

Requirements:
1. Use ${diagnosisCode} - ${diagnosisName} as the PRIMARY pathway driver.
2. If diagnosisContext contains secondary diagnoses or complications, integrate them as comorbidity/complication considerations inside assessments, treatments, monitoring, discharge criteria, education, and risk review. Do not generate separate unrelated pathways for each diagnosis.
3. Estimate the standard Length of Stay (LOS) for the full episode using the primary diagnosis plus clinically meaningful secondary/complication context.
4. Return estimatedLos as the expected inpatient duration in days. For outpatient/IGD-only cases, use 1 unless the diagnosis combination usually requires observation/admission.
5. Break phases according to the estimatedLos. Do NOT always force a static 3-day pathway.
6. The phases array may group clinically similar adjacent days, but the grouped dayRange MUST clearly cover the entire estimatedLos from Day 1 through Day N. Example for estimatedLos 7: "Day 1", "Day 2-3", "Day 4-6", "Day 7".
7. Do not stop before the estimatedLos. The final phase dayRange must include the last LOS day.
8. Use phaseName as the clinical activity title only, e.g. "Admission", "Treatment", "Monitoring", "Discharge". Avoid putting day labels inside phaseName.
9. Include discharge criteria in the final phase, including stability requirements for relevant secondary diagnoses/complications when applicable.
10. Return every user-facing text field in Bahasa Indonesia, including phaseName, objectives, assessments, treatments, medication instructions, nursing, nutrition, education, and discharge criteria. Keep JSON keys exactly as defined by the schema. Use English only for stable medical abbreviations when clinically standard.
11. Use a recovery-oriented, hopeful, and operational tone: emphasize patient stabilization, readiness for discharge, and clear actions that help the claim reach compliant/approved status. Do not inflate scores or hide risks; explain review items as actionable improvements.

Generate a clinically realistic and auditable pathway for Indonesian healthcare review context.`,
      temperature: this.temperature,
    });

    return { data: object, usage: usage as any };
  }

  async validateDocumentCompleteness(payload: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      isValid: z.boolean(),
      score: z.number().describe("Score 0-100 based on completeness"),
      details: z.object({
        providedDocuments: z.array(z.string()),
        missingRequiredDocuments: z.array(z.string()),
        notes: z.string()
      })
    });

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      prompt: `Return ONLY raw JSON matching the schema. Do not use markdown.\n\nAnalyze the following claim for document completeness:\n\n${JSON.stringify(payload, null, 2)}\n\nRequired documents are exactly: LMA, KTP, KARTU ASURANSI, SK KAMAR, FORM KRONOLOGIS KECELAKAAN, and SURAT PERNYATAAN RAWAT INAP. Identify any missing required documents from this list only.`,
      temperature: this.temperature,
    });

    return { data: object, usage: usage as any };
  }

  async mapArbitraryJsonToClaim(rawJson: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      patient: z.object({
        id: z.string().nullable().describe('Patient ID or MRN'),
        name: z.string().describe('Full patient name'),
        dateOfBirth: z.string().nullable().describe('ISO 8601 date e.g. 1990-01-01'),
        gender: z.enum(['M', 'F']).nullable().describe('Gender: M for Male, F for Female'),
      }),
      encounter: z.object({
        type: z.enum(['RAWAT_INAP', 'RAWAT_JALAN', 'IGD']).nullable().describe('Encounter type'),
        admissionDate: z.string().nullable().describe('ISO 8601 admission datetime'),
        dischargeDate: z.string().nullable().describe('ISO 8601 discharge datetime'),
        facility: z.object({
          id: z.string().nullable().describe('Facility ID'),
          name: z.string().nullable().describe('Facility Name'),
          type: z.string().nullable().describe('Facility Type e.g. KLINIK, RS_TIPE_C'),
        }).nullable(),
      }),
      diagnoses: z.array(z.object({
        code: z.string().describe('ICD-10 code e.g. O82, A01, etc'),
        name: z.string().describe('Human-readable diagnosis name'),
        type: z.enum(['PRIMARY', 'SECONDARY', 'COMPLICATION']).describe('PRIMARY is the main diagnosis'),
        sequence: z.number().nullable().describe('Diagnosis sequence number'),
      })),
      procedures: z.array(z.object({
        code: z.string().nullable().describe('Procedure code from the source system, or null if absent'),
        name: z.string().describe('Human-readable procedure name'),
        category: z.string().nullable().describe('General service category, or empty string if unknown'),
        quantity: z.number().nullable().describe('Number of times performed. Default is 1 if unknown'),
        unitPrice: z.number().nullable().describe('Claimed unit price in IDR. Use 0 if absent'),
        totalPrice: z.number().nullable().describe('Claimed total price in IDR. If absent, compute unitPrice * quantity'),
        performedDate: z.string().nullable().describe('ISO 8601 date procedure performed'),
        performedBy: z.string().nullable().describe('Practitioner who performed the procedure'),
      })),
      medications: z.array(z.object({
        name: z.string().describe('Brand or generic medical item name'),
        genericName: z.string().nullable().describe('Generic/active ingredient name, or empty string if unknown'),
        dosage: z.string().nullable().describe('Dose/strength/form, or empty string if unknown'),
        quantity: z.number().nullable().describe('Amount dispensed. Default is 1 if unknown'),
        unitPrice: z.number().nullable().describe('Claimed unit price in IDR. Use 0 if absent'),
        totalPrice: z.number().nullable().describe('Claimed total price in IDR. If absent, compute unitPrice * quantity'),
        frequency: z.string().nullable().describe('Frequency of medication administration'),
        route: z.string().nullable().describe('Route of administration'),
        prescribedDate: z.string().nullable().describe('ISO 8601 date medication prescribed'),
        prescribedBy: z.string().nullable().describe('Practitioner who prescribed the medication'),
      })),
      totalClaimAmount: z.number().nullable().describe('Total claimed amount in IDR'),
      currency: z.string().nullable().describe('Currency code e.g. IDR'),
      notes: z.string().nullable().describe('Clinical notes or summary'),
      documents: z.array(z.object({
        type: z.string().describe('Document type. Use only LMA, KTP, KARTU ASURANSI, SK KAMAR, FORM KRONOLOGIS KECELAKAAN, SURAT PERNYATAAN RAWAT INAP, or source-provided non-required type.'),
        date: z.string().nullable().describe('ISO 8601 document date when known; otherwise use the encounter admission date or current mapping date.'),
        conclusion: z.string().nullable().describe('Short Bahasa Indonesia document conclusion. Required document availability flags should use the standard conclusion text.'),
        url: z.string().nullable().describe('URL to the document'),
        description: z.string().nullable().describe('Description or summary of the document'),
      })).nullable().describe('Supporting documents for the claim'),
      policyRules: z.array(z.object({
        ruleCode: z.string().describe('Unique code for the policy rule'),
        ruleName: z.string().describe('Human-readable name of the policy rule'),
        ruleType: z.string().describe('e.g. LIMIT, EXCLUSION'),
        actionJsonStr: z.string().nullable().describe('JSON configuration for the rule action as a string e.g. "{\\"maxAmount\\":5000000}"'),
        severity: z.string().nullable().describe('e.g. WARNING, REJECT_RECOMMENDED, REVIEW_NEEDED'),
        status: z.string().nullable().describe('e.g. ACTIVE, INACTIVE'),
        effectiveFrom: z.string().nullable().describe('ISO 8601 date when the rule became effective'),
        targetType: z.string().nullable().describe('e.g. PROCEDURE, MEDICATION_NAME'),
        targetPattern: z.string().nullable().describe('Regex or pattern to match targets'),
      })).nullable().describe('Applicable policy rules for this claim'),
      _mappingNotes: z.string().describe('Brief explanation of what was mapped and any ambiguities encountered'),
    });

    const systemPrompt = `You are a medical data integration expert for multi-client healthcare claim data.
Your task is to analyze an arbitrary JSON payload from any provider/source system (FHIR, HL7, EHR export, billing export, or custom JSON) and map it to SnapPath's canonical claim validation schema.
Rules:
- Use canonical keys only. Procedures must use code, name, category, quantity, unitPrice, totalPrice. Medications must use code, name, genericName, dosage, quantity, unitPrice, totalPrice.
- Do not emit duplicate legacy aliases such as description, procedureName, medicationName, price, claimedUnitPrice, or claimedTotal.
- Map dates to ISO 8601 format.
- Normalize gender to 'male' or 'female' if recognizable.
- Diagnosis/procedure codes should be preserved as-is; if absent, use null for optional code fields and keep the best human-readable name.
- For prices/amounts in the source: preserve as-is in IDR (do NOT convert currencies). If only unit price is present, compute totalPrice = unitPrice * quantity.
- If the source contains a top-level SnapText documents array, preserve every required supporting document entry using canonical type, date, and conclusion.
- If the source still contains legacy SnapText document availability flags under document_metadata, create supporting documents only for flags that are true:
  * has_lembar_medis_awal -> type LMA, conclusion "Laporan Medis Awal: demam 3 hari, nyeri kepala dan mialgia, NS1 dengue positif, trombosit dan hematokrit dimonitor serial, tidak ada tanda perdarahan aktif. Rawat inap untuk monitoring cairan, tanda vital, dan edukasi tanda bahaya."
  * has_ktp -> type KTP, conclusion "Identitas sesuai KTP."
  * has_kartu_asuransi -> type KARTU ASURANSI, conclusion "Kartu Asuransi aktif."
  * has_sk_kamar -> type SK KAMAR, conclusion "Sesuai hak kelas rawat."
  * has_form_kronologis_kecelakaan -> type FORM KRONOLOGIS KECELAKAAN, conclusion "Kronologi jelas; kasus bukan kecelakaan."
  * has_surat_pernyataan_rawat_inap -> type SURAT PERNYATAAN RAWAT INAP, conclusion "Persetujuan rawat inap ditandatangani."
- Do not create required document entries for false, absent, or ambiguous documents.
- If a field is genuinely absent or unmappable, use null, empty string, zero, or empty arrays according to the schema.
- Provide a brief _mappingNotes explaining your interpretation decisions`;

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      system: systemPrompt,
      prompt: `Map the following JSON to SnapPath claim structure:\n\n${JSON.stringify(rawJson, null, 2)}`,
      temperature: 0.1, // Lower temperature for deterministic mapping
    });

    return { data: object, usage: usage as any };
  }

  async estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string, thresholds?: { overstayDays?: number; understayDays?: number }): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      estimatedLos: z.number().describe('Standard expected LOS in days for an uncomplicated inpatient case.'),
      minLos: z.number().describe('Minimum LOS for mild/uncomplicated cases with rapid clinical improvement.'),
      maxLos: z.number().describe('Maximum LOS before the case is considered complicated or inefficient.'),
      stayStatusThresholds: z.object({
        overstayDays: z.number().describe('Number of days above estimatedLos before flagging OVERSTAY. Typically 1-2 days tolerance.'),
        understayDays: z.number().describe('Number of days below estimatedLos before flagging UNDERSTAY risk (premature discharge). Typically 1-2 days.'),
      }).describe('Thresholds for determining over/understay status relative to estimatedLos.'),
      therapyRecommendation: z.object({
        phases: z.array(z.object({
          phase: z.string().describe('Phase name, e.g. "Stabilisasi Awal", "Terapi Aktif", "Step-down", "Persiapan Pulang"'),
          dayRange: z.string().describe('Day range, e.g. "Hari 1", "Hari 2-4", "Hari 5-7"'),
          keyActivities: z.array(z.string()).describe('Key clinical activities in this phase that justify the duration'),
        })).describe('Therapy phases that drive the LOS duration. Each phase explains WHY those days are needed.'),
        criticalPathItems: z.array(z.string()).describe('The therapy items on the critical path that determine minimum LOS (e.g., "IV antibiotics 5 hari", "observasi trombosit serial 3 hari")'),
      }).describe('Recommended therapy pathway that justifies the LOS estimate. This feeds into clinical pathway generation.'),
      justification: z.string().describe('Clinical justification in Bahasa Indonesia explaining why this LOS is needed, referencing the therapy phases.'),
      references: z.array(z.string()).describe('Clinical guidelines or references: Kemenkes PNPK, Panduan Praktik Klinis (PPK), WHO, PAPDI, IDAI, etc.'),
    });

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      schemaName: 'DiagnosisLosEstimate',
      schemaDescription: 'LOS estimate with therapy pathway recommendation. Return raw JSON only, no markdown.',
      experimental_repairText: repairDiagnosisLosJsonText,
      system: `You are a senior clinical pathway analyst and medical reviewer for multi-client healthcare claim review. Your task is to provide LOS estimates that are:

1. CLINICALLY ACCURATE — based on standard therapy protocols for the diagnosis
2. PATHWAY-ALIGNED — the LOS must be justified by specific therapy phases (admission → active treatment → step-down → discharge preparation)
3. ACTIONABLE for claim validation — the system uses your estimate to flag OVERSTAY (inefficiency/fraud risk) and UNDERSTAY (premature discharge/readmission risk)

KEY PRINCIPLES:
- LOS is driven by the THERAPY PATHWAY, not arbitrary numbers. Each day of stay must be justified by a clinical activity.
- For surgical cases: LOS = pre-op preparation + procedure day + post-op recovery + discharge criteria met
- For medical cases: LOS = stabilization + active treatment duration (e.g., IV antibiotics, fluid resuscitation) + step-down to oral + discharge criteria
- For obstetric cases: LOS = delivery + maternal/neonatal observation + breastfeeding establishment

INA-CBG CONTEXT:
- INA-CBG groups have expected LOS ranges. Exceeding the upper bound triggers audit flags.
- Understay (<minLos) may indicate premature discharge, incomplete treatment, or data entry error.
- The estimatedLos should represent the STANDARD uncomplicated pathway, not best-case or worst-case.

STAY STATUS LOGIC:
- OVERSTAY threshold: typically 1-2 days above estimatedLos before flagging. Set higher (2-3 days) for complex diagnoses with variable recovery.
- UNDERSTAY threshold: typically 1-2 days below estimatedLos. Set to 1 for short-stay diagnoses (LOS ≤ 3 days).
- These thresholds feed directly into the validation engine to determine COMPLIANT vs OVERSTAY vs UNDERSTAY status.

Return ONLY raw JSON matching the schema. Do not use markdown, prose, headings, or tables. All user-facing text in Bahasa Indonesia.`,
      prompt: `Return ONLY this JSON shape: {"estimatedLos": number, "minLos": number, "maxLos": number, "stayStatusThresholds": {"overstayDays": number, "understayDays": number}, "therapyRecommendation": {"phases": [{"phase": string, "dayRange": string, "keyActivities": string[]}], "criticalPathItems": string[]}, "justification": string, "references": string[]}.

Configured SnapPath review thresholds:
- overstayDays: ${thresholds?.overstayDays ?? 'not configured'}
- understayDays: ${thresholds?.understayDays ?? 'not configured'}
Use these configured thresholds in stayStatusThresholds when provided. If not provided, choose clinically reasonable thresholds and justify them.

Estimate the standard Length of Stay (LOS) for:
Diagnosis Code: ${diagnosisCode}
Diagnosis Name: ${diagnosisName}

ANALYSIS STEPS:

1. IDENTIFY STANDARD THERAPY PATHWAY:
   - What is the standard treatment protocol for this diagnosis in Indonesian hospitals?
   - Break it into sequential phases: stabilization → active treatment → monitoring/step-down → discharge preparation
   - For each phase, list the key clinical activities that determine its duration

2. DERIVE LOS FROM THERAPY:
   - estimatedLos = sum of all therapy phase durations for a standard uncomplicated case
   - minLos = fastest possible completion if patient responds optimally (mild case)
   - maxLos = longest expected stay before complications are suspected (still within normal pathway)

3. SET STAY STATUS THRESHOLDS:
   - overstayDays: how many days above estimatedLos is acceptable before flagging? Consider diagnosis variability.
   - understayDays: how many days below estimatedLos risks incomplete treatment?

4. LIST CRITICAL PATH ITEMS:
   - What therapy items determine the MINIMUM possible LOS? (e.g., "IV antibiotics course 5 hari", "observasi pasca-operasi 2 hari")
   - These are the items that CANNOT be shortened without clinical risk

5. JUSTIFY IN BAHASA INDONESIA:
   - Write a clear clinical justification connecting the therapy phases to the LOS
   - Reference standard guidelines (Kemenkes PNPK, PPK, WHO, specialist society guidelines)`,
      temperature: 0.2,
    });

    return { data: object, usage: usage as any };
  }
}

