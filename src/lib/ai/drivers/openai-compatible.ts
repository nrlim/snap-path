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
        matchedProcedures: z.array(z.string()).describe('Claimed procedures that are clinically relevant to this diagnosis'),
        unmatchedProcedures: z.array(z.string()).describe('Only procedures that are clearly irrelevant after clinical reasoning. Do not include procedures merely because they are absent from local mapping.'),
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
      prompt: `Return ONLY raw JSON matching the schema. Do not use markdown.\n\nYou are a clinical pathway validation expert for Indonesian healthcare (JKN/BPJS context). Analyze the following claim for medical necessity and diagnosis-treatment appropriateness:\n\n${JSON.stringify(payload, null, 2)}\n\nFor each diagnosis:\n1. Assess whether each CLAIMED procedure is clinically relevant to the diagnosis.\n2. Assess whether each CLAIMED medication is appropriate for the diagnosis, including supportive therapy, symptom control, antibiotics, fluids, chronic medication continuation, and route/formulation context.\n3. Mark a procedure as irrelevant ONLY if there is no plausible diagnostic, therapeutic, monitoring, administrative admission, imaging, laboratory, nursing, or supportive-care relationship to the diagnosis.\n4. Mark a medication as INAPPROPRIATE only when it clearly has no plausible relation to the diagnosis or common inpatient supportive care. If it could depend on symptoms/comorbidity/lab results, use REVIEW_NEEDED.\n5. Do NOT mark a procedure irrelevant merely because it is absent from a local mapping table or uses a local hospital code. If uncertain, treat it as relevant/needs context, not irrelevant.\n6. For every irrelevant procedure or medication finding, provide a specific reason and state which diagnosis it is being compared against.\n7. Missing required procedures must be truly required by standard pathway. Suggested procedures are advisory only and must not be labeled required.\n8. For suggested procedures, explain why they may be considered, but make clear they are not yet claimed.\n9. Provide a brief clinical summary of the condition for admission context.\nBase your analysis on standard Indonesian medical guidelines and clinical pathways. Be conservative: false irrelevant flags are harmful for users. Use a constructive, recovery-oriented tone: frame findings as clear actions to improve clinical completeness and claim readiness without hiding clinical risk.`,
      temperature: this.temperature,
    });

    return { data: object, usage: usage as any };
  }

  async searchDrugMarketPrice(drug: string | { name: string; genericName?: string | null; dosage?: string | null }): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      marketPriceMax: z.number().describe('Highest verified UNIT price in IDR for the smallest dispensable unit. Return 0 if no reliable source is available.'),
      marketPriceAvg: z.number().nullable().describe('Average verified UNIT price in IDR, or null if fewer than two comparable prices are available.'),
      sources: z.array(z.string()).describe('Source evidence array. Each entry: "source_name | product_name strength form | package_info | package_price_IDR | unit_conversion_calculation | per_unit_price_IDR | URL_or_page_title"'),
      resolvedProductName: z.string().describe('The exact product name and specification that was matched, e.g. "Ringer Lactate Infusion 500ml (Generic)" or "Ceftriaxone 1g Injection Vial (Generic)"'),
      dosageForm: z.string().describe('The dosage form identified: tablet, capsule, syrup, injection_vial, injection_ampoule, infusion_bottle, cream, etc.'),
      unitBasis: z.string().describe('What constitutes one "unit" for the price: "per tablet", "per vial", "per ampoule", "per bottle 500ml", "per strip 10 tab", etc.'),
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
      system: `You are a senior Indonesian hospital pharmacist and drug pricing analyst. Your SOLE PURPOSE is to provide accurate market reference prices for medications so the system can detect OVERCHARGE or UNDERCHARGE in hospital insurance claims.

ROLE CONTEXT:
- Hospital claims list medications with brand or generic names + unit prices
- You provide the fair market reference price for the SAME unit basis
- The system compares: claimed price vs your reference → flag if overcharged (>threshold) or suspiciously undercharged

YOUR EXPERTISE & REFERENCE SOURCES (in priority order):
1. Online pharmacy retail: K24Klik.com, Halodoc, Farmaku, Lifepack, GoApotik, KimiaFarma.co.id (Primary source for current retail market prices)
2. E-commerce platforms: Tokopedia, Shopee, Blibli (Secondary source for real-world consumer pricing)
3. MIMS Indonesia (mims.com/indonesia) — Professional drug database with indicative pricing, indications, dosage, and formulation details. Use MIMS drug monographs to identify correct product specifications and price ranges.
4. SATUSEHAT / Formularium Nasional (satusehat.kemkes.go.id) — Kemenkes official platform containing the national drug formulary (FORNAS), regulated pricing tiers, and e-Katalog integration.
5. e-Katalog LKPP (e-katalog.lkpp.go.id) — Government procurement baseline pricing (lowest legitimate institutional price)
6. HET (Harga Eceran Tertinggi) from Kemenkes regulations
- Hospital markup norms: 10-30% above HNA for generics, up to 50% for branded/originator
- Dosage form identification and unit conversion

BRAND vs GENERIC RESOLUTION:
- If the drug name is a BRAND (e.g. "Sanmol", "Biogesic", "Kalnex"), identify the generic active ingredient
- Always research BOTH the brand price AND the generic equivalent price
- Return marketPriceMax based on the BRAND price if brand is specified, generic price if generic is specified
- Include both brand and generic sources when available for comparison

CRITICAL REFERENCE RANGES (Indonesian market, per dispensable UNIT):
┌──────────────────────────────────────────┬───────────────────────────┐
│ Drug                                     │ Price Range (IDR/unit)    │
├──────────────────────────────────────────┼───────────────────────────┤
│ IV Fluid RL/NaCl 500ml bottle            │ 10.000 - 30.000/bottle   │
│ Paracetamol 500mg tab (generic)          │ 300 - 1.500/tab          │
│ Paracetamol 500mg tab (Sanmol/branded)   │ 1.000 - 3.500/tab        │
│ Paracetamol Syrup 60ml                   │ 8.000 - 25.000/bottle    │
│ Ceftriaxone 1g inj vial (generic)        │ 25.000 - 80.000/vial     │
│ Amoxicillin 500mg cap (generic)          │ 500 - 2.000/cap          │
│ Omeprazole 20mg cap (generic)            │ 800 - 3.000/cap          │
│ Ranitidine 150mg tab (generic)           │ 300 - 1.500/tab          │
│ Metformin 500mg tab (generic)            │ 300 - 1.200/tab          │
│ Ciprofloxacin 500mg tab (generic)        │ 500 - 3.000/tab          │
│ Ondansetron 4mg inj amp                  │ 5.000 - 25.000/amp       │
│ Ketorolac 30mg inj amp                   │ 5.000 - 20.000/amp       │
│ Asam Traneksamat 500mg inj amp           │ 5.000 - 25.000/amp       │
│ Lansoprazole 30mg cap (generic)          │ 800 - 4.000/cap          │
│ Cefixime 100mg cap (generic)             │ 1.000 - 5.000/cap        │
│ Metronidazole 500mg infusion bottle      │ 15.000 - 40.000/bottle   │
└──────────────────────────────────────────┴───────────────────────────┘
These are SANITY CHECK guidelines. If your result exceeds 3x the upper range, you MUST explain WHY (originator brand, special formulation, import-only, etc).

ANTI-HALLUCINATION RULES:
- If you have NO reliable knowledge of the price → return marketPriceMax: 0
- Do NOT invent URLs, pharmacy names, or prices
- Do NOT confuse package price with unit price (a STRIP of 10 tablets is NOT 1 tablet)
- Do NOT confuse different strengths (500mg ≠ 250mg ≠ 1g)`,
      prompt: `Research the Indonesian market price for this medication to validate a hospital claim:

${JSON.stringify(drugContext, null, 2)}

STEP 1 — IDENTIFY PRODUCT:
- Parse: active ingredient, strength, dosage form (tablet/capsule/syrup/vial/ampoule/infusion bottle)
- Determine if branded or generic. If branded → also identify the generic equivalent
- "Strip" in the name means the claim unit is per STRIP (not per individual tablet)

STEP 2 — DETERMINE UNIT BASIS:
- Match the unit basis to what the hospital would typically bill:
  * "Tablet/Tab" without "Strip" → per tablet
  * "Strip" → per strip (usually 10 tablets)
  * "Injection/Inj Vial" → per vial
  * "Injection/Inj Ampoule/Amp" → per ampoule
  * "IV Fluid/Infusion" → per bottle
  * "Syrup/Suspension/Drops" → per bottle
  * "Capsule/Cap" without "Strip" → per capsule

STEP 3 — RESEARCH PRICING (check sources in this order):
- Online pharmacies: K24Klik, Halodoc, Farmaku, Lifepack, GoApotik, KimiaFarma.co.id
- E-commerce platforms: Tokopedia, Shopee, Blibli (look for official or reputable pharmacy stores)
- MIMS Indonesia (mims.com/indonesia): look up the drug monograph for indicative pricing, available formulations, and manufacturer info
- SATUSEHAT / FORNAS (satusehat.kemkes.go.id): check if the drug is listed in the national formulary with regulated price ceiling
- e-Katalog LKPP (e-katalog.lkpp.go.id): government procurement baseline price
- For branded drugs: also get the generic version price for comparison
- Convert ALL prices to the determined unit basis with explicit math

STEP 4 — SANITY CHECK:
- Compare against the reference table in system prompt
- If your price is >3x the upper range → re-verify or explain
- If your price is <0.3x the lower range → re-verify (possible wrong product match)

OUTPUT:
- marketPriceMax = highest verified UNIT price (matching the unit basis)
- marketPriceAvg = average of verified prices (null if <2 sources)
- sources: each entry = "source | product_matched | package_info | package_price_IDR | conversion_math | per_unit_price_IDR | URL"
- If NO reliable data found → marketPriceMax: 0, marketPriceAvg: null, sources: []`,
      temperature: 0.1,
    });

    return { data: object, usage: usage as any };
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

