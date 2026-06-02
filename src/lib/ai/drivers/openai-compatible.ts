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
    const schema = z.object({
      isValid: z.boolean(),
      score: z.number().min(0).max(100),
      details: z.array(z.object({
        diagnosisCode: z.string(),
        diagnosisName: z.string().describe('Human-readable name of the diagnosis'),
        clinicalSummary: z.string().describe('Brief 2-3 sentence clinical summary of this condition for admision context'),
        matchedProcedures: z.array(z.string()).describe('Claimed procedures that are clinically relevant to this diagnosis. Include code and name when available.'),
        unmatchedProcedures: z.array(z.string()).describe('Only claimed procedures that are clearly irrelevant after clinical reasoning. Do not include procedures merely because they are absent from local mapping.'),
        procedureFindings: z.array(z.object({
          procedureCode: z.string(),
          procedureName: z.string(),
          status: z.enum(['APPROPRIATE', 'REVIEW_NEEDED', 'INAPPROPRIATE']),
          reason: z.string().describe('Specific clinical rationale for the status, tied to diagnosis, procedure purpose, and available claim context'),
          againstDiagnosis: z.string().describe('Diagnosis/code being assessed'),
          confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Use HIGH only when the relationship is clear from standard clinical practice or clearly unrelated')
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
          reason: z.string().describe('Clinical reason explaining whether the medication matches this diagnosis'),
          againstDiagnosis: z.string().describe('Diagnosis/code being assessed'),
          confidence: z.enum(['LOW', 'MEDIUM', 'HIGH'])
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
        notes: z.string()
      }))
    });

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      prompt: `Return ONLY raw JSON matching the schema. Do not use markdown.

You are a senior clinical pathway reviewer for Indonesian healthcare claims (JKN/BPJS and hospital billing context). Your task is to perform a clinically sound fallback review when local diagnosis-procedure mapping is absent or incomplete.

CLAIM PAYLOAD:
${JSON.stringify(payload, null, 2)}

CORE PRINCIPLES:
1. Do NOT use hardcoded diagnosis-procedure mappings. Base your review on clinical reasoning, standard pathway logic, and the actual claim context only.
2. Local lookup/mapping data, if present in the payload, is supporting evidence only. If it is absent/empty/incomplete, perform direct AI clinical review; absence from mapping is NEVER evidence of non-compliance.
3. Assess every CLAIMED procedure against every relevant diagnosis using the procedure name, code, encounter type, admission context, medications, documents, LOS/outcome notes, and common inpatient workflow.
4. Consider broad legitimate relationships: diagnostic workup, therapeutic treatment, monitoring, nursing/supportive care, admission/administrative care, labs, imaging, surgery/anesthesia, rehabilitation, discharge planning, and complication/comorbidity management.
5. Mark a procedure APPROPRIATE when there is a plausible clinical or operational relationship to the diagnosis/admission.
6. Mark REVIEW_NEEDED when the procedure could be appropriate but depends on missing clinical context such as symptoms, severity, lab/imaging results, procedure notes, comorbidity, complication, route, or timing.
7. Mark INAPPROPRIATE only when the procedure is clearly unrelated to the diagnosis/admission and you can explain why. Use HIGH confidence only for clearly unrelated cases.
8. Do not penalize local hospital procedure codes, uncommon names, bundled services, or non-standard code systems. Use the description/name as the main semantic signal when code systems are local.
9. Missing required procedures must be conservative. Use REQUIRED only when a standard pathway strongly requires the item for safe care in this encounter. Common/optional items should go to suggestedProcedures, not missingRequiredProcedures.
10. Medication findings should include supportive therapy, symptom control, antibiotics, fluids, chronic medication continuation, prophylaxis, and comorbidity context. Use REVIEW_NEEDED if indication depends on undocumented context.

OUTPUT REQUIREMENTS PER DIAGNOSIS:
- procedureFindings: include one finding for each claimed procedure.
- matchedProcedures: include procedures assessed as APPROPRIATE.
- unmatchedProcedures and irrelevantProcedures: include only procedures assessed as INAPPROPRIATE with MEDIUM/HIGH confidence.
- missingRequiredProcedures: include only REQUIRED items; do not put COMMON/OPTIONAL suggestions here.
- suggestedProcedures: advisory only, never mandatory.
- notes: briefly summarize clinical review rationale and any missing context.
- isValid should be false only when there is at least one true REQUIRED missing item, one clearly INAPPROPRIATE procedure/medication with MEDIUM/HIGH confidence, or other material clinical inconsistency.
- score should reflect severity: keep high scores for plausible care with context gaps; reduce more for clear unrelated procedures or missing required critical care.

Be conservative and clinically precise: false irrelevant flags are harmful. If uncertain, choose REVIEW_NEEDED with a concrete reason instead of INAPPROPRIATE.`,
      temperature: Math.min(this.temperature, 0.2),
    });

    return { data: object, usage: usage as any };
  }

  async searchDrugMarketPrice(drug: string | { name: string; genericName?: string | null; dosage?: string | null }): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      isNonMedication: z.boolean().describe('true if this item is a medical supply, device (alkes), service, or anything else that is NOT a pharmaceutical drug. Examples: gloves, syringes, swabs, catheters, admin fees, services.'),
      marketPriceMax: z.number().describe('Highest UNIT price in IDR. Return 0 ONLY if the active ingredient is completely unrecognized in Indonesia, OR if isNonMedication is true.'),
      marketPriceAvg: z.number().nullable().describe('Average UNIT price in IDR, or null if only one data point available.'),
      sources: z.array(z.string()).describe('Source entries: "ai_knowledge_v1 | resolved_product | sites | package_context | conversion_math | per_unit_IDR | training_data"'),
      resolvedProductName: z.string().describe('Canonical product name after normalization, e.g. "Lidocaine HCl 2% 5ml Ampoule" or "Ceftriaxone 1g Injection Vial"'),
      dosageForm: z.string().describe('Dosage form: tablet, capsule, syrup, injection_vial, injection_ampoule, infusion_bottle, cream, suppository, etc. For Non-Medication (Bukan Obat): glove, syringe, swab, catheter, bandage, etc.'),
      unitBasis: z.string().describe('Unit basis for pricing: "per tablet", "per vial", "per ampoule", "per bottle 500ml", "per strip 10 tab", "per tube", "per pair", "per piece", etc.'),
    });

    const drugContext = typeof drug === 'string'
      ? { name: drug, genericName: null, dosage: null }
      : {
        name: drug.name,
        genericName: drug.genericName || null,
        dosage: drug.dosage || null,
      };

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      system: `You are a senior Indonesian hospital pharmacist specializing in drug pricing for JKN/BPJS claim audits. Your task is to provide market reference prices from your training knowledge of Indonesian drug prices so the system can detect OVERCHARGE or UNDERCHARGE.

CRITICAL: You are processing drug entries from Indonesian hospital information systems (SIMRS). These systems often embed dosage/volume/concentration directly in the drug name field in non-standard ways. You MUST normalize the name before searching.

INDONESIAN HOSPITAL DRUG NAMING CONVENTIONS:
Drug names from SIMRS often look like these — you must parse them correctly:
- "LIDOCAINE HCL 5ML 2%" → Active: Lidocaine HCl, Strength: 2%, Volume: 5ml, Form: injection ampoule
- "CEFTRIAXONE INJ 1G" → Active: Ceftriaxone, Strength: 1g, Form: injection vial
- "NACL 0,9% 100ML" → Active: NaCl 0.9%, Volume: 100ml, Form: infusion bottle
- "AMOX 500MG KAPS" → Active: Amoxicillin, Strength: 500mg, Form: capsule
- "OMEPRAZOL INJ 40MG" → Active: Omeprazole, Strength: 40mg, Form: injection vial
- "RL 500 ML" or "RINGER LAKTAT 500ML" → Ringer Lactate 500ml infusion bottle
- "DEXAMETHASONE 5MG/ML 1ML AMP" → Active: Dexamethasone, Strength: 5mg/ml×1ml=5mg, Form: ampoule
- "METRONIDAZOLE INF 500MG/100ML" → Active: Metronidazole 500mg/100ml, Form: infusion bottle

INDONESIAN ABBREVIATIONS TO NORMALIZE:
- INJ / INJEKSI → injection (determine vial vs ampoule by volume: <10ml=ampoule, ≥10ml=vial)
- INF / INFUS / INFUSION → infusion bottle (IV bag)
- TAB / TABLET → tablet
- KAPS / KAP / CAP / CAPSULE → capsule
- AMP / AMPUL / AMPOULE → ampoule
- VL / VIAL → vial
- SYR / SIRUP / SYRUP → syrup bottle
- SUSP / SUSPENSI → suspension bottle
- SUPP / SUPPOSITORIA → suppository
- KRIM / CREAM → cream tube
- GEL → gel tube
- SALEP / OINT → ointment tube
- LAR / LARUTAN → solution
- STRIP → strip (contains multiple tablets/capsules, usually 10)
- BTL / BOTOL → bottle
- TTS / TETES → drops (eye/ear/nasal)
- OBT KUMUR → mouthwash/gargle
- PLSTR / PATCH → transdermal patch

LOOKUP PRIORITY CONTEXT:
This prompt is a legacy fallback only. The production validation workflow now resolves prices from local MedicalItemPriceCache / KFA master data first and normally does not call AI for drug pricing. If this prompt is called manually, keep the answer conservative, do not claim direct KFA/database access, and use public Indonesian pharmacy / market knowledge only.

REFERENCE SOURCES (from training knowledge):
1. K24Klik, Halodoc, Farmaku, GoApotik, Lifepack, KimiaFarma — retail pharmacy prices
2. MIMS Indonesia — professional drug database with price ranges
3. e-Katalog LKPP — government procurement baseline (floor price)
4. HET/HNA Kemenkes — regulated maximum retail price
5. Hospital markup norms: +10-30% above HNA for generics; up to +50% for branded

NON-MEDICATION (Bukan Obat) CLASSIFICATION — check this FIRST before any normalization:
If the item is a MEDICAL SUPPLY, DEVICE (alat kesehatan), SERVICE, or anything that is NOT a pharmaceutical drug:
→ Set isNonMedication: true, marketPriceMax: 0, sources: [], and stop immediately.
Examples of Non-Medication: exam gloves, surgical gloves, disposable syringes, IV needles, alcohol/antiseptic swabs,
catheters, bandages, gauze pads, admin fees, services, consultation fees.
Drug examples: tablets, capsules, injections, infusions (NaCl, RL, Dextrose, antibiotics, analgesics, etc.)
CRITICAL: The following MUST be classified as DRUGs (isNonMedication: false) and price-checked:
- Vitamins, Supplements, Electrolytes (e.g., Trolit, Oralit), Herbal/Fitofarmaka
- Vaccines & Serums (e.g., ATS, ABU, Tetanus Toxoid)
- Contrast Media for Radiology (e.g., Iopamidol, Omnipaque)
- Blood Products & Plasma Expanders (e.g., Human Albumin 20%, Gelofusine)
- Parenteral/Enteral Nutrition (e.g., Aminofluid, Peptisol milk)
- Topical Antiseptics (e.g., Povidone Iodine, Alcohol 70%, Chlorhexidine)
Key distinctions: DISP SYRINGE → Non-Medication. EXAM GLOVE → Non-Medication. B.AC SWAB / Benzalkonium Swab → Non-Medication.
NaCl 0.9% infusion → DRUG (pharmacological agent). Metronidazole infusion → DRUG. Trolit Sachet → DRUG.

ANTI-HALLUCINATION RULES:
1. "PFS" means Pre-Filled Syringe. Do not hallucinate it as a 500ml infusion bottle.
2. If the drug dosage is in "mg/ml" (injection), NEVER guess the unit as a "500ml bottle" unless the name explicitly says "INFUSION" or "NaCl/RL". Injections are ampoules/vials/PFS (1-20ml).
3. Do NOT aggressively guess brand names. "REMOPAIN" is Ketorolac (NSAID), NOT Remifentanil. If you are not 100% sure about a brand name, rely strictly on the genericName provided in the input, or return the original input name EXACTLY as-is.
4. "100ml bottle" ≠ "500ml bottle" (different prices)
5. "2%" ≠ "5%" concentration (different prices)
6. NEVER alter the milligram (mg) strength. If the input says "250mg", the resolvedProductName MUST be 250mg, not 500mg.
7. If the item is a complex compound or unknown supplement, use its functional name (e.g., "Multivitamin tablet") instead of hallucinating a random active ingredient.
8. Return isNonMedication: true for non-drugs/medical supplies, marketPriceMax: 0 for those
9. Use the UPPER BOUND of any known price range for marketPriceMax
10. Return marketPriceMax: 0 ONLY when the active ingredient is genuinely unrecognized in Indonesia`,

      prompt: `Price lookup for Indonesian hospital claim validation:

INPUT:
${JSON.stringify(drugContext, null, 2)}

--- STEP 0: NORMALIZE THE DRUG NAME ---
Hospital SIMRS systems embed dosage info in the name field. Parse all components:
- What is the active ingredient (generic INN name)?
- What is the strength/concentration? (mg, g, %, mg/ml, IU, etc.)
- What is the volume or package size? (ml, mg per vial, etc.)
- What dosage form abbreviation is present? (INJ/INF/TAB/KAPS/AMP/VL/SYR/etc.)
- Is there a brand name? What is the generic equivalent?
- Normalize: map abbreviated form to canonical form (e.g. INJ → injection_vial or injection_ampoule)

--- STEP 1: DETERMINE UNIT BASIS ---
Based on normalized form, determine what 1 "unit" means for hospital billing:
- Injection ampoule (<10ml): 1 unit = 1 ampoule
- Injection vial (≥10ml or powder for reconstitution): 1 unit = 1 vial
- Infusion bag/bottle: 1 unit = 1 bottle at specified volume
- Tablet/Capsule (no Strip): 1 unit = 1 tablet/capsule
- Strip: 1 unit = 1 strip (typically 10 tablets — note the count and show division math)
- Syrup/Suspension: 1 unit = 1 bottle
- Cream/Gel/Ointment: 1 unit = 1 tube

--- STEP 2: PRICE LOOKUP (stop at the first successful attempt) ---

ATTEMPT A — Exact normalized product:
Recall Indonesian pharmacy price for: {active_ingredient} {strength} {form}
→ If you know this exact product's price, USE IT and stop. Do NOT continue to B/C/D.

ATTEMPT B — Nearest common strength (ONLY if A yielded no result):
If the stated strength is unusual, use the nearest standard Indonesian strength.
→ If found, USE IT and stop.

ATTEMPT C — Active ingredient + form only (ONLY if A and B both failed):
Use the most common Indonesian strength for this active ingredient + form.
→ If found, USE IT and stop.

ATTEMPT D — genericName field (ONLY if A/B/C all failed and genericName differs from name):
Try the genericName field as a completely separate lookup.

PRICE RECALL HINTS for common Indonesian hospital drugs:
- Paracetamol 500mg tab: Rp 200–500/tab (generic)
- Amoxicillin 500mg cap: Rp 500–1.500/cap (generic)
- Ceftriaxone 1g inj vial: Rp 8.000–25.000/vial (generic)
- Cefotaxime 1g inj vial: Rp 8.000–20.000/vial
- Omeprazole 20mg/40mg inj: Rp 15.000–45.000/vial; oral: Rp 500–2.000/cap
- Ranitidine 25mg/ml 2ml amp: Rp 2.000–5.000/amp
- Ondansetron 4mg/2ml amp: Rp 3.000–10.000/amp; 8mg/4ml: Rp 5.000–15.000/amp
- Ketorolac 30mg/ml 1ml amp: Rp 3.000–8.000/amp
- Dexamethasone 5mg/ml 1ml amp: Rp 1.500–5.000/amp
- Metronidazole 500mg/100ml inf: Rp 8.000–20.000/bottle
- NaCl 0.9% 100ml: Rp 5.000–15.000/bottle; 500ml: Rp 8.000–20.000/bottle
- Ringer Lactate 500ml: Rp 8.000–20.000/bottle; 1000ml: Rp 12.000–30.000/bottle
- Dextrose 5% 500ml: Rp 10.000–22.000/bottle
- Furosemide 10mg/ml 2ml amp: Rp 1.500–4.000/amp; oral 40mg tab: Rp 200–500/tab
- Lidocaine HCl 2% 5ml amp: Rp 3.000–8.000/amp; 2% 20ml vial: Rp 8.000–20.000/vial
- Metformin 500mg tab: Rp 300–800/tab (generic)
- Amlodipine 5mg/10mg tab: Rp 300–1.500/tab
- Captopril 12.5mg/25mg tab: Rp 200–600/tab
- Diazepam 5mg/ml 2ml amp: Rp 2.000–6.000/amp
- Tramadol 50mg cap: Rp 1.500–4.000/cap; 100mg/2ml amp: Rp 5.000–12.000/amp
- Vitamin C 200mg/ml 5ml amp: Rp 2.000–6.000/amp
- Vitamin B complex tab: Rp 200–500/tab
- Antacid suspension (per bottle): Rp 8.000–25.000/bottle
- Salbutamol 2.5mg/2.5ml nebul: Rp 3.000–8.000/respule
- Insulin Novorapid/Apidra/Humalog 100IU/ml 3ml: Rp 80.000–120.000/cartridge
- Albumin 20% 100ml: Rp 350.000–600.000/bottle
- Heparin 5000IU/ml 1ml amp: Rp 15.000–35.000/amp

--- STEP 3: OUTPUT ---
- marketPriceMax: Use the upper bound of the recalled price range (conservative for fraud detection)
- marketPriceAvg: Middle of the known range; null if only one price point known
- resolvedProductName: Canonical name after normalization (e.g. "Lidocaine HCl 2% 5ml Injection Ampoule")
- sources: ONE entry per recall attempt that yielded a result:
  "ai_knowledge_v1 | {resolvedProductName} | K24Klik/Halodoc/Farmaku/eLKPP | {package_context} | {conversion_math_if_needed} | {per_unit_IDR} | training_data"
- Return marketPriceMax: 0 ONLY if the active ingredient is completely unrecognized OR unavailable in Indonesia`,
      temperature: 0.1,
    });

    return { data: object, usage: usage as any };
  }

  async searchDrugMarketPriceBatch(drugs: Array<{ name: string; genericName?: string | null; dosage?: string | null }>): Promise<{ data: any[]; usage?: Usage }> {
    // Batch pricing: send all drugs in one AI call rather than N sequential calls.
    // This is the primary latency optimization — reduces N AI round-trips to 1.
    const schema = z.object({
      results: z.array(z.object({
        index: z.number().int().describe('Zero-based index matching the position in the input drugs array'),
        isNonMedication: z.boolean().describe('true if item is a medical supply, device (bukan obat), or service, NOT a pharmaceutical drug. Examples: gloves, syringes, swabs, catheters, bandages, IV needles.'),
        marketPriceMax: z.number().describe('Highest UNIT price in IDR. Return 0 if isNonMedication is true, or if item is completely unrecognized in Indonesia.'),
        marketPriceAvg: z.number().nullable().describe('Average UNIT price in IDR, or null if only one data point.'),
        sources: z.array(z.string()).describe('Source entries: "ai_knowledge_v1 | resolved_product | sites | package_context | conversion | per_unit_IDR | training_data"'),
        resolvedProductName: z.string().describe('Canonical name after SIMRS normalization, e.g. "Ceftriaxone 1g Injection Vial"'),
        dosageForm: z.string().describe('tablet, capsule, injection_vial, injection_ampoule, infusion_bottle, syrup_bottle, cream, glove, syringe, swab, catheter, bandage, etc.'),
        unitBasis: z.string().describe('"per tablet", "per vial", "per ampoule", "per bottle 500ml", "per strip 10 tab", "per tube", "per pair", "per piece", etc.'),
      })).describe('One result object per drug input, in index order.'),
    });

    const drugsJson = JSON.stringify(drugs.map((d, i) => ({ index: i, ...d })), null, 2);

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      experimental_repairText: repairJsonOnlyText,
      system: `You are a senior Indonesian hospital pharmacist specializing in drug pricing for JKN/BPJS claim audits. You MUST return a price result for EVERY drug in the input list, maintaining the same index order.

CRITICAL: Drug entries are from Indonesian hospital SIMRS that embed dosage/volume/concentration in the drug name field non-standardly. You MUST normalize each name before pricing.

INDONESIAN HOSPITAL DRUG NAMING CONVENTIONS — parse each name:
- "LIDOCAINE HCL 5ML 2%" → Lidocaine HCl 2% 5ml, Form: injection_ampoule
- "CEFTRIAXONE INJ 1G" → Ceftriaxone 1g, Form: injection_vial
- "NACL 0,9% 100ML" → NaCl 0.9% 100ml, Form: infusion_bottle
- "AMOX 500MG KAPS" → Amoxicillin 500mg, Form: capsule
- "OMEPRAZOL INJ 40MG" → Omeprazole 40mg, Form: injection_vial
- "RL 500 ML" → Ringer Lactate 500ml, Form: infusion_bottle
- "DEXAMETHASONE 5MG/ML 1ML AMP" → Dexamethasone 5mg/ml×1ml=5mg, Form: injection_ampoule
- "METRONIDAZOLE INF 500MG/100ML" → Metronidazole 500mg/100ml, Form: infusion_bottle

ABBREVIATION MAP:
INJ/INJEKSI→injection | INF/INFUS→infusion_bottle | TAB/TABLET→tablet | KAPS/CAP/CAPSULE→capsule
AMP/AMPUL→ampoule | VL/VIAL→vial | SYR/SIRUP→syrup | SUSP→suspension | SUPP→suppository
KRIM/CREAM→cream | GEL→gel | SALEP/OINT→ointment | LAR→solution | STRIP→strip | TTS→drops
PFS→Pre-Filled Syringe (usually 1-3ml, NEVER a 500ml bottle)

UNIT BASIS RULES:
- Ampoule (<10ml): 1 unit = 1 ampoule | Vial (≥10ml or powder): 1 unit = 1 vial
- Infusion bag: 1 unit = 1 bottle at stated volume | Tablet/Cap (no STRIP): 1 unit = 1 tab/cap
- STRIP: 1 unit = 1 strip (usually 10 tabs — show division math explicitly)
- Syrup/Suspension: 1 unit = 1 bottle | Cream/Gel/Ointment: 1 unit = 1 tube

NON-MEDICATION CLASSIFICATION \u2014 check this FIRST for each drug before normalization:
If the item is a MEDICAL SUPPLY, DEVICE, SERVICE, or anything that is NOT a pharmaceutical drug:
→ Set isNonMedication: true, marketPriceMax: 0, sources: [], and stop for that item.
Non-Medication: exam gloves, disposable syringes, IV needles, antiseptic swabs, catheters, admin fees, etc.
CRITICAL: The following MUST be classified as DRUGs (isNonMedication: false) and price-checked:
- Vitamins, Supplements, Electrolytes (e.g., Trolit, Oralit), Herbal/Fitofarmaka
- Vaccines & Serums (e.g., ATS, ABU, Tetanus Toxoid)
- Contrast Media for Radiology (e.g., Iopamidol, Omnipaque)
- Blood Products & Plasma Expanders (e.g., Human Albumin 20%, Gelofusine)
- Parenteral/Enteral Nutrition (e.g., Aminofluid, Peptisol milk)
- Topical Antiseptics (e.g., Povidone Iodine, Alcohol 70%, Chlorhexidine)
Key: DISP SYRINGE → Non-Med. EXAM GLOVE → Non-Med. B.AC SWAB → Non-Med.
NaCl 0.9% infusion → DRUG. Metronidazole infusion → DRUG. Lidocaine injection → DRUG. Trolit Sachet → DRUG.

PRICE LOOKUP PER DRUG (stop at the first successful attempt):
Context: this is a legacy fallback. Production validation prioritizes local MedicalItemPriceCache / KFA master data and normally skips AI lookup to reduce latency. If this prompt is called manually, use online pharmacy / public market knowledge only and keep the result conservative.
A→ Exact normalized product — if known, use it and skip B/C/D
B→ Nearest common strength (only if A failed)
C→ Active ingredient + form only (only if A+B failed)
D→ genericName field (only if A+B+C failed and genericName differs)

ANTI-HALLUCINATION RULES:
1. "PFS" means Pre-Filled Syringe. Do not hallucinate it as a 500ml infusion bottle.
2. If the drug dosage is in "mg/ml" (injection), NEVER guess the unit as a "500ml bottle" unless the name explicitly says "INFUSION" or "NaCl/RL". Injections are ampoules/vials/PFS (1-20ml).
3. Do NOT aggressively guess brand names. "REMOPAIN" is Ketorolac (NSAID), NOT Remifentanil. If you are not 100% sure about a brand name, rely strictly on the genericName provided in the input, or return it exactly as-is.
4. "100ml bottle" ≠ "500ml bottle" (different prices)
5. "2%" ≠ "5%" concentration (different prices)
6. NEVER alter the milligram (mg) strength. If the input says "250mg", the resolvedProductName MUST be 250mg, not 500mg.
7. If the item is a complex compound or unknown supplement, use its functional name (e.g., "Multivitamin tablet") instead of hallucinating a random active ingredient.
8. Return isNonMedication: true for non-drugs/medical supplies, marketPriceMax: 0 for those
9. Return marketPriceMax: 0 ONLY when the active ingredient is genuinely unrecognized in Indonesia
10. NEVER skip an index — every drug must have a result entry`,

      prompt: `Price ALL ${drugs.length} drugs below for Indonesian hospital claim validation. Return one result per drug, maintaining index order.

INPUT DRUGS:
${drugsJson}

PRICE REFERENCE TABLE (Indonesian retail market, use UPPER BOUND as marketPriceMax):
Paracetamol 500mg tab: Rp 200–500/tab | Amoxicillin 500mg cap: Rp 500–1.500/cap
Ceftriaxone 1g vial: Rp 8.000–25.000/vial | Cefotaxime 1g vial: Rp 8.000–20.000/vial
Omeprazole 40mg inj: Rp 15.000–45.000/vial | Omeprazole 20mg cap: Rp 500–2.000/cap
Ranitidine 25mg/ml 2ml amp: Rp 2.000–5.000/amp | Ondansetron 4mg/2ml amp: Rp 3.000–10.000
Ondansetron 8mg/4ml amp: Rp 5.000–15.000/amp | Ketorolac 30mg/ml 1ml amp: Rp 3.000–8.000
Dexamethasone 5mg/ml 1ml amp: Rp 1.500–5.000/amp | Metronidazole 500mg/100ml inf: Rp 8.000–20.000
NaCl 0.9% 100ml: Rp 5.000–15.000 | NaCl 0.9% 500ml: Rp 8.000–20.000
Ringer Lactate 500ml: Rp 8.000–20.000 | Ringer Lactate 1000ml: Rp 12.000–30.000
Dextrose 5% 500ml: Rp 10.000–22.000 | Furosemide 10mg/ml 2ml amp: Rp 1.500–4.000
Furosemide 40mg tab: Rp 200–500/tab | Lidocaine HCl 2% 5ml amp: Rp 3.000–8.000
Lidocaine HCl 2% 20ml vial: Rp 8.000–20.000 | Metformin 500mg tab: Rp 300–800
Amlodipine 5mg/10mg tab: Rp 300–1.500 | Captopril 12.5/25mg tab: Rp 200–600
Diazepam 5mg/ml 2ml amp: Rp 2.000–6.000 | Tramadol 50mg cap: Rp 1.500–4.000
Tramadol 100mg/2ml amp: Rp 5.000–12.000 | Vitamin C 200mg/ml 5ml amp: Rp 2.000–6.000
Vitamin B complex tab: Rp 200–500 | Antacid suspension/bottle: Rp 8.000–25.000
Salbutamol 2.5mg/2.5ml nebule: Rp 3.000–8.000 | Albumin 20% 100ml: Rp 350.000–600.000
Heparin 5000IU/ml 1ml amp: Rp 15.000–35.000 | Insulin rapid-acting 3ml cartridge: Rp 80.000–120.000
Spironolactone 25mg tab: Rp 300–800 | Bisoprolol 5mg tab: Rp 500–2.000
Simvastatin 20mg tab: Rp 300–1.000 | Atorvastatin 20mg tab: Rp 1.000–4.000
Tranexamic acid 500mg/5ml amp: Rp 8.000–20.000 | Ciprofloxacin 200mg/100ml inf: Rp 15.000–35.000
Ciprofloxacin 500mg tab: Rp 800–3.000 | Gentamicin 40mg/ml 2ml amp: Rp 3.000–8.000

For each drug:
1. Normalize SIMRS name → canonical form
2. Determine unit basis
3. Recall Indonesian market price using reference table above or training knowledge
4. Format source: "ai_knowledge_v1 | {resolved_product} | K24Klik/Halodoc/Farmaku/eLKPP | {package_context} | {conversion_if_any} | {per_unit_IDR} | training_data"
5. Return 0 ONLY for genuinely unrecognized active ingredients`,
      temperature: 0.1,
    });

    // Map results array back by index, filling any gaps with empty fallback
    const resultMap = new Map<number, any>();
    for (const r of (object as any).results ?? []) {
      resultMap.set(Number(r.index), r);
    }
    const data = drugs.map((_, i) => resultMap.get(i) ?? {
      index: i, marketPriceMax: 0, marketPriceAvg: null, sources: [],
      resolvedProductName: '', dosageForm: 'unknown', unitBasis: 'unknown',
    });

    return { data, usage: usage as any };
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }> {
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
1. Estimate the standard Length of Stay (LOS) for this diagnosis using general clinical knowledge and publicly known practice patterns when no internal master LOS is available.
2. Return estimatedLos as the expected inpatient duration in days. For outpatient/IGD-only cases, use 1 unless the diagnosis usually requires observation/admission.
3. Break phases according to the estimatedLos. Do NOT always force a static 3-day pathway.
4. The phases array may group clinically similar adjacent days, but the grouped dayRange MUST clearly cover the entire estimatedLos from Day 1 through Day N. Example for estimatedLos 7: "Day 1", "Day 2-3", "Day 4-6", "Day 7".
5. Do not stop before the estimatedLos. The final phase dayRange must include the last LOS day.
6. Use phaseName as the clinical activity title only, e.g. "Admission", "Treatment", "Monitoring", "Discharge". Avoid putting day labels inside phaseName.
7. Include discharge criteria in the final phase.
8. Return every user-facing text field in Bahasa Indonesia, including phaseName, objectives, assessments, treatments, medication instructions, nursing, nutrition, education, and discharge criteria. Keep JSON keys exactly as defined by the schema. Use English only for stable medical abbreviations when clinically standard.
9. Use a recovery-oriented, hopeful, and operational tone: emphasize patient stabilization, readiness for discharge, and clear actions that help the claim reach compliant/approved status. Do not inflate scores or hide risks; explain review items as actionable improvements.

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
        name: z.string().describe('Full patient name'),
        birthDate: z.string().describe('ISO 8601 date e.g. 1990-01-01').nullable(),
        gender: z.enum(['male', 'female', 'M', 'F', 'L', 'P', 'Laki-Laki', 'Perempuan', '']).nullable(),
        identifier: z.array(z.object({ value: z.string() })).describe('Array of IDs like MRN'),
      }),
      encounter: z.object({
        class: z.object({ code: z.string().describe('e.g. IMP, AMB, RAWAT_INAP, RAWAT_JALAN') }),
        period: z.object({
          start: z.string().describe('ISO 8601 admission datetime').nullable(),
          end: z.string().describe('ISO 8601 discharge datetime. Null if still admitted').nullable(),
        }),
      }),
      diagnoses: z.array(z.object({
        code: z.string().describe('ICD-10 code e.g. O82, A01, etc').nullable(),
        name: z.string().describe('Human-readable diagnosis name'),
        type: z.enum(['primary', 'secondary', 'complication']).describe('primary is the main diagnosis'),
      })),
      procedures: z.array(z.object({
        code: z.string().describe('Procedure code (ICD-9-CM, CPT, or local code)').nullable(),
        name: z.string().describe('Human-readable procedure name'),
        quantity: z.number().describe('Number of times performed. Default is 1 if unknown').nullable(),
        price: z.number().describe('Unit price in IDR').nullable(),
      })),
      medications: z.array(z.object({
        name: z.string().describe('Brand or generic drug name'),
        quantity: z.number().describe('Amount dispensed. Default is 1 if unknown').nullable(),
        price: z.number().describe('Unit price in IDR').nullable(),
      })),
      documents: z.array(z.object({
        type: z.string().describe('e.g. LMA, KTP, KARTU ASURANSI, SK KAMAR, FORM KRONOLOGIS KECELAKAAN, SURAT PERNYATAAN RAWAT INAP'),
        conclusion: z.string().describe('Summary or result of the document').nullable(),
      })),
      extra: z.object({
        insuranceNumber: z.string().nullable().describe('BPJS or insurance policy number'),
        los: z.string().nullable().describe('Length of stay in days as string'),
        nik: z.string().nullable().describe('National ID number (NIK)'),
        insuranceType: z.string().nullable().describe('Type: BPJS, Asuransi Swasta, etc.'),
      }),
      _mappingNotes: z.string().describe('Brief explanation of what was mapped and any ambiguities encountered'),
    });

    const systemPrompt = `You are a medical data integration expert specializing in Indonesian healthcare (JKN/BPJS).
Your task is to analyze an arbitrary JSON payload from any hospital system (SIMRS, SIRS, HL7 FHIR, custom export, etc.) and intelligently map its fields to the SnapPath claim validation schema.
Rules:
- Map dates to ISO 8601 format
- Normalize gender to 'male' or 'female' if recognizable
- ICD-10 codes should be preserved as-is; if absent, infer from text context
- For prices/amounts in the source: preserve as-is in IDR (do NOT convert currencies)
- If a field is genuinely absent or unmappable, use null or empty arrays
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

  async estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }> {
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
      system: `You are a senior clinical pathway analyst and medical reviewer specializing in the Indonesian healthcare system (JKN/BPJS, INA-CBG). Your task is to provide LOS estimates that are:

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

