import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AIGatewayDriver, AIMessage, Usage } from '../gateway';

const DEFAULT_SUMOPOD_BASE_URL = 'https://ai.sumopod.com/v1';
const DEFAULT_SUMOPOD_MODEL = 'gpt-4o-mini';

export class SumoPodAIDriver implements AIGatewayDriver {
  private ai: ReturnType<typeof createOpenAI>;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(apiKey?: string, baseURL?: string, model?: string, maxTokens?: number, temperature?: number) {
    this.ai = createOpenAI({
      apiKey: apiKey || process.env.SUMOPOD_API_KEY || '',
      baseURL: baseURL || process.env.SUMOPOD_BASE_URL || DEFAULT_SUMOPOD_BASE_URL,
    });
    this.defaultModel = model || process.env.SUMOPOD_MODEL || DEFAULT_SUMOPOD_MODEL;
    this.maxTokens = maxTokens || 1500;
    this.temperature = temperature ?? 0.7;
  }

  async generateText(prompt: string, context?: AIMessage[]): Promise<{ text: string; usage?: Usage }> {
    const messages = (context || []).map(msg => ({ role: msg.role, content: msg.content }));
    if (prompt) messages.push({ role: 'user', content: prompt });

    const { text, usage } = await generateText({
      model: this.ai(this.defaultModel),
      messages: messages as any,
      temperature: this.temperature,
    });

    return { text, usage: usage as any };
  }

  async extractMedicalData(clinicalText: string): Promise<{ data: Record<string, unknown>; usage?: Usage }> {
    const { object, usage } = await this.generateObject(
      z.record(z.string(), z.unknown()),
      `Extract structured medical entities from the following text:\n\n${clinicalText}`,
    );

    return { data: object, usage };
  }

  async validateDiagnosisTreatment(payload: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      isValid: z.boolean().optional().default(false),
      score: z.number().min(0).max(100).optional().default(50),
      details: z.array(z.object({
        diagnosisCode: z.string().optional().default(''),
        diagnosisName: z.string().describe('Human-readable name of the diagnosis').optional().default(''),
        clinicalSummary: z.string().describe('Brief 2-3 sentence clinical summary of this condition for admision context').optional().default(''),
        matchedProcedures: z.array(z.string()).optional().default([]),
        unmatchedProcedures: z.array(z.string()).optional().default([]),
        missingRequiredProcedures: z.array(z.string()).optional().default([]),
        suggestedProcedures: z.array(z.object({
          code: z.string().describe('Procedure code e.g. ICD-9 or local code').optional().default(''),
          name: z.string().describe('Human-readable procedure name').optional().default(''),
          rationale: z.string().describe('Why this procedure is relevant to the diagnosis').optional().default(''),
        })).describe('Procedures relevant to this diagnosis that were NOT claimed, AI-suggested for admision review').optional().default([]),
        notes: z.string().optional().default(''),
      })).optional().default([]),
    });

    const { object, usage } = await this.generateObject(
      schema,
      `You are a clinical pathway validation expert for Indonesian healthcare (JKN/BPJS context). Analyze the following claim for medical necessity and diagnosis-treatment appropriateness:\n\n${JSON.stringify(payload, null, 2)}\n\nFor each diagnosis:\n1. Assess if the claimed procedures and medications are appropriate.\n2. Identify mismatched or irrelevant procedures.\n3. Suggest additional procedures that are clinically relevant but NOT yet claimed (for admision review).\n4. Provide a brief clinical summary of the condition for admision context.\nBase your analysis on standard Indonesian medical guidelines and clinical pathways.`,
      undefined,
      {},
      (raw) => {
        if (!raw || typeof raw !== 'object') return raw;
        let target = raw as Record<string, unknown>;
        // Salvage if AI returns analysis.diagnosis wrapper instead of details[]
        if (!target['details'] || (Array.isArray(target['details']) && (target['details'] as unknown[]).length === 0)) {
          const analysis = target['analysis'] as Record<string, unknown> | undefined;
          const diag = analysis?.['diagnosis'] as Record<string, unknown> | undefined;
          if (diag) {
            const procs = (diag['procedures'] || {}) as Record<string, unknown>;
            const meds = (diag['medications'] || {}) as Record<string, unknown>;
            const extractNames = (arr: unknown) => Array.isArray(arr)
              ? arr.map(a => typeof a === 'string' ? a : (a as any)?.name || String(a)) : [];
            const extractSugg = (arr: unknown) => Array.isArray(arr)
              ? arr.map(a => typeof a === 'string'
                ? { code: '', name: a, rationale: '' }
                : { code: (a as any)?.code || '', name: (a as any)?.name || '', rationale: (a as any)?.justification || (a as any)?.rationale || '' })
              : [];
            target['details'] = [{
              diagnosisCode: diag['code'] || '',
              diagnosisName: diag['name'] || '',
              clinicalSummary: (() => {
                const cs = diag['clinical_summary'] || diag['clinicalSummary'];
                if (!cs) return '';
                if (typeof cs === 'string') return cs;
                // SumoPod sometimes returns { condition: "..." } instead of a flat string
                if (typeof cs === 'object') {
                  const obj = cs as Record<string, unknown>;
                  return Object.values(obj).filter(v => typeof v === 'string').join(' ') || JSON.stringify(cs);
                }
                return String(cs);
              })(),
              matchedProcedures: extractNames(procs['claimed']),
              unmatchedProcedures: extractNames(procs['mismatched']),
              missingRequiredProcedures: [],
              suggestedProcedures: [...extractSugg(procs['suggested']), ...extractSugg(meds['suggested'])],
              notes: '',
            }];
            target['isValid'] = true;
          }
        }
        return target;
      },
    );

    return { data: object, usage };
  }

  async searchDrugMarketPrice(drug: string | { name: string; genericName?: string | null; dosage?: string | null }): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      marketPriceMax: z.number().describe('Highest verified UNIT price in IDR for the smallest dispensable unit. Return 0 if no reliable source is available.').optional().default(0),
      marketPriceAvg: z.number().nullable().describe('Average verified UNIT price in IDR, or null if fewer than two comparable prices are available.').optional().default(null),
      sources: z.array(z.string()).describe('Source evidence array. Each entry: "source_name | product_name strength form | package_info | package_price_IDR | unit_conversion_calculation | per_unit_price_IDR | URL_or_page_title"').optional().default([]),
      resolvedProductName: z.string().describe('The exact product name and specification that was matched').optional().default(typeof drug === 'string' ? drug : drug.name),
      dosageForm: z.string().describe('The dosage form identified: tablet, capsule, syrup, injection_vial, injection_ampoule, infusion_bottle, cream, etc.').optional().default('unknown'),
      unitBasis: z.string().describe('What constitutes one "unit" for the price: "per tablet", "per vial", "per ampoule", "per bottle 500ml", "per strip 10 tab", etc.').optional().default('unit'),
    });

    const drugContext = typeof drug === 'string'
      ? { name: drug, genericName: null, dosage: null }
      : { name: drug.name, genericName: drug.genericName || null, dosage: drug.dosage || null };

    const { object, usage } = await this.generateObject(
      schema,
      `Perform a deep pharmaceutical price research for this medication in the Indonesian market:\n\n${JSON.stringify(drugContext, null, 2)}\n\nSTEP-BY-STEP ANALYSIS REQUIRED:\n\nStep 1: IDENTIFY THE PRODUCT\n- Parse the drug name to identify: active ingredient, strength/concentration, dosage form (tablet, capsule, syrup, injection vial, injection ampoule, IV infusion bottle, etc.)\n- If the name contains "IV Fluid" or "Infusion" → this is an infusion fluid bottle, NOT an injection\n- If the name contains "Injection" or "Inj" → identify if it's a vial or ampoule\n- If the name contains "Tablet" or "Tab" or "Capsule" or "Cap" → oral solid dosage form\n- If the name contains "Syrup" or "Suspension" or "Drops" → oral liquid dosage form\n- Determine if this is likely a generic (OGB), branded generic, or originator/patent drug\n\nStep 2: RESEARCH PRICING\n- Search for the GENERIC version first (most Indonesian hospital claims use generic drugs)\n- Check e-Katalog LKPP pricing as a baseline (government procurement price)\n- Check retail pharmacy prices from: K24Klik, Halodoc, Farmaku, Lifepack, GoApotik, KlikDokter, Alodokter\n- For hospital context, generic drug prices should be the primary reference\n\nStep 3: CALCULATE UNIT PRICE\n- Convert ALL found prices to the same unit basis that matches the claim context:\n  * For tablets/capsules: price per tablet/capsule (NOT per strip or per box)\n  * For injection vials: price per vial\n  * For injection ampoules: price per ampoule\n  * For IV infusion fluids: price per bottle (e.g., per 500ml bottle)\n  * For syrups/suspensions: price per bottle\n- Show the conversion calculation explicitly in sources\n- Example: "Strip 10 tablet @ Rp 15.000 → Rp 1.500/tablet"\n- Example: "Box 25 vial @ Rp 750.000 → Rp 30.000/vial"\n\nStep 4: SANITY CHECK\n- Compare your final unit price against the pricing context provided in the system prompt\n- If the price seems unreasonably high or low, re-examine your sources\n- A hospital claim price for a common generic drug should typically be within the ranges provided\n\nOUTPUT RULES:\n1. marketPriceMax = the highest verified UNIT price found (converted to per-unit basis)\n2. marketPriceAvg = average of verified UNIT prices (null if < 2 sources)\n3. If you cannot find ANY reliable Indonesian pharmacy source, return marketPriceMax: 0, marketPriceAvg: null, sources: []\n4. Do NOT hallucinate or estimate prices without source evidence\n5. Each source entry MUST include: source_name | exact_product_matched | package_info | package_price | unit_conversion | per_unit_price | URL_or_reference`,
      `You are a senior Indonesian hospital pharmacist and pricing analyst with deep knowledge of the Indonesian pharmaceutical market (e-Katalog LKPP, HET/HNA regulations, and retail pharmacy pricing).\n\nYour expertise includes:\n- Indonesian generic drug pricing (obat generik berlogo / OGB) vs branded generics vs paten/originator\n- e-Katalog LKPP government procurement prices as baseline references\n- Retail pharmacy pricing from K24, Kimia Farma, Century, Halodoc, Farmaku, Lifepack, GoApotik\n- Hospital markup patterns (typically 10-30% above HNA for most items)\n- Dosage form identification: infusion fluids, injection vials/ampoules, oral tablets/capsules, syrups, etc.\n\nCRITICAL PRICING CONTEXT for Indonesian market (use as sanity check):\n- IV Fluid (Ringer Lactate / NaCl 0.9% 500ml): Rp 10.000 - Rp 30.000 per bottle\n- Paracetamol 500mg tablet (generic): Rp 300 - Rp 1.500 per tablet\n- Paracetamol Syrup 120mg/5ml 60ml: Rp 8.000 - Rp 25.000 per bottle\n- Ceftriaxone 1g injection vial (generic): Rp 25.000 - Rp 80.000 per vial\n- Amoxicillin 500mg capsule (generic): Rp 500 - Rp 2.000 per capsule\n- Omeprazole 20mg capsule (generic): Rp 800 - Rp 3.000 per capsule\n- Ranitidine 150mg tablet (generic): Rp 300 - Rp 1.500 per tablet\n- Metformin 500mg tablet (generic): Rp 300 - Rp 1.200 per tablet\n- Ciprofloxacin 500mg tablet (generic): Rp 500 - Rp 3.000 per tablet\n- Ondansetron 4mg injection ampoule: Rp 5.000 - Rp 25.000 per ampoule\n\nThese ranges are GUIDELINES. Your verified sources may show prices within or slightly outside these ranges, which is acceptable. But if your research returns a price that is 3x or more above these ranges, you MUST re-verify and explain why (e.g., originator brand, special formulation, etc).\n\nYou must be CONSERVATIVE and AUDITABLE. Never fabricate prices, URLs, or sources.`,
      { temperature: 0.1 },
    );

    return { data: object, usage };
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      estimatedLos: z.number().optional().default(3),
      phases: z.array(z.object({
        phaseId: z.string().optional().default(''),
        phaseName: z.string().optional().default('Phase'),
        dayRange: z.string().optional().default('Day 1'),
        objectives: z.array(z.string()).optional().default([]),
        assessments: z.array(z.object({
          name: z.string().optional().default('Assessment'),
          frequency: z.string().optional().default('As needed'),
          mandatory: z.boolean().optional().default(false),
        })).optional().default([]),
        treatments: z.array(z.object({
          name: z.string().optional().default('Treatment'),
          route: z.string().nullable().optional().default(null),
          mandatory: z.boolean().optional().default(false),
        })).optional().default([]),
        medications: z.array(z.object({
          name: z.string().optional().default('Medication'),
          dosage: z.string().optional().default('-'),
          frequency: z.string().optional().default('-'),
          route: z.string().optional().default('oral'),
          duration: z.string().optional().default('-'),
          mandatory: z.boolean().optional().default(false),
        })).optional().default([]),
        nursing: z.array(z.object({
          activity: z.string().optional().default('Nursing activity'),
          frequency: z.string().optional().default('As needed'),
        })).optional().default([]),
        nutrition: z.object({
          diet: z.string().optional().default('Diet sesuai kondisi'),
          restrictions: z.array(z.string()).nullable().optional().default([]),
        }).optional().default({ diet: 'Diet sesuai kondisi', restrictions: [] }),
        education: z.array(z.string()).optional().default([]),
        dischargeGate: z.object({
          criteria: z.array(z.string()).optional().default([]),
          mustMeetAll: z.boolean().optional().default(true),
        }).nullable().optional().default(null),
      })).optional().default([]),
    });

    const { object, usage } = await this.generateObject(
      schema,
      `Generate a realistic clinical pathway for ${diagnosisCode} - ${diagnosisName} suitable for Indonesian healthcare context.\n\nRequirements:\n1. Estimate the standard Length of Stay (LOS) for this diagnosis using general clinical knowledge and publicly known practice patterns when no internal master LOS is available.\n2. Return estimatedLos as the expected inpatient duration in days. For outpatient/IGD-only cases, use 1 unless the diagnosis usually requires observation/admission.\n3. Break phases according to the estimatedLos. Do NOT always force a static 3-day pathway.\n4. The phases array may group clinically similar adjacent days, but the grouped dayRange MUST clearly cover the entire estimatedLos from Day 1 through Day N. Example for estimatedLos 7: "Day 1", "Day 2-3", "Day 4-6", "Day 7".\n5. Do not stop before the estimatedLos. The final phase dayRange must include the last LOS day.\n6. Use phaseName as the clinical activity title only, e.g. "Admission", "Treatment", "Monitoring", "Discharge". Avoid putting day labels inside phaseName.\n7. Include discharge criteria in the final phase.\n\nGenerate a clinically realistic and auditable pathway for Indonesian healthcare review context.`,
      undefined,
      {},
      normalizePathwayPhases,
    );

    return { data: object, usage };
  }

  async validateDocumentCompleteness(payload: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      isValid: z.boolean().optional().default(false),
      score: z.number().describe('Score 0-100 based on completeness').optional().default(0),
      details: z.object({
        providedDocuments: z.array(z.string()).optional().default([]),
        missingRequiredDocuments: z.array(z.string()).optional().default([]),
        notes: z.string().optional().default(''),
      }).optional().default({ providedDocuments: [], missingRequiredDocuments: [], notes: '' }),
    });

    const { object, usage } = await this.generateObject(
      schema,
      `Analyze the following claim for document completeness:\n\n${JSON.stringify(payload, null, 2)}\n\nRequired documents are exactly: LMA, KTP, KARTU ASURANSI, SK KAMAR, FORM KRONOLOGIS KECELAKAAN, and SURAT PERNYATAAN RAWAT INAP. Identify any missing required documents from this list only.`,
    );

    return { data: object, usage };
  }

  async mapArbitraryJsonToClaim(rawJson: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      patient: z.object({
        name: z.string().describe('Full patient name').optional().default('Unknown'),
        birthDate: z.string().describe('ISO 8601 date e.g. 1990-01-01').nullable().optional().default(null),
        gender: z.enum(['male', 'female', 'M', 'F', 'L', 'P', 'Laki-Laki', 'Perempuan', '']).nullable().optional().default(null),
        identifier: z.array(z.object({ value: z.string().optional().default('') })).describe('Array of IDs like MRN').optional().default([]),
      }).optional().default({ name: 'Unknown', birthDate: null, gender: null, identifier: [] }),
      encounter: z.object({
        class: z.object({ code: z.string().describe('e.g. IMP, AMB, RAWAT_INAP, RAWAT_JALAN').optional().default('') }).optional().default({ code: '' }),
        period: z.object({
          start: z.string().describe('ISO 8601 admission datetime').nullable().optional().default(null),
          end: z.string().describe('ISO 8601 discharge datetime. Null if still admitted').nullable().optional().default(null),
        }).optional().default({ start: null, end: null }),
      }).optional().default({ class: { code: '' }, period: { start: null, end: null } }),
      diagnoses: z.array(z.object({
        code: z.string().describe('ICD-10 code e.g. O82, A01, etc').nullable().optional().default(null),
        name: z.string().describe('Human-readable diagnosis name').optional().default(''),
        type: z.enum(['primary', 'secondary', 'complication']).describe('primary is the main diagnosis').optional().default('primary'),
      })).optional().default([]),
      procedures: z.array(z.object({
        code: z.string().describe('Procedure code (ICD-9-CM, CPT, or local code)').nullable().optional().default(null),
        name: z.string().describe('Human-readable procedure name').optional().default(''),
        quantity: z.number().describe('Number of times performed. Default is 1 if unknown').nullable().optional().default(1),
        price: z.number().describe('Unit price in IDR').nullable().optional().default(null),
      })).optional().default([]),
      medications: z.array(z.object({
        name: z.string().describe('Brand or generic drug name').optional().default(''),
        quantity: z.number().describe('Amount dispensed. Default is 1 if unknown').nullable().optional().default(1),
        price: z.number().describe('Unit price in IDR').nullable().optional().default(null),
      })).optional().default([]),
      documents: z.array(z.object({
        type: z.string().describe('e.g. LMA, KTP, KARTU ASURANSI, SK KAMAR, FORM KRONOLOGIS KECELAKAAN, SURAT PERNYATAAN RAWAT INAP').optional().default(''),
        conclusion: z.string().describe('Summary or result of the document').nullable().optional().default(null),
      })).optional().default([]),
      extra: z.object({
        insuranceNumber: z.string().nullable().describe('BPJS or insurance policy number').optional().default(null),
        los: z.string().nullable().describe('Length of stay in days as string').optional().default(null),
        nik: z.string().nullable().describe('National ID number (NIK)').optional().default(null),
        insuranceType: z.string().nullable().describe('Type: BPJS, Asuransi Swasta, etc.').optional().default(null),
      }).optional().default({ insuranceNumber: null, los: null, nik: null, insuranceType: null }),
      _mappingNotes: z.string().describe('Brief explanation of what was mapped and any ambiguities encountered').optional().default(''),
    });

    const { object, usage } = await this.generateObject(
      schema,
      `Map the following JSON to SnapPath claim structure:\n\n${JSON.stringify(rawJson, null, 2)}`,
      `You are a medical data integration expert specializing in Indonesian healthcare (JKN/BPJS).\nYour task is to analyze an arbitrary JSON payload from any hospital system (SIMRS, SIRS, HL7 FHIR, custom export, etc.) and intelligently map its fields to the SnapPath claim validation schema.\nRules:\n- Map dates to ISO 8601 format\n- Normalize gender to 'male' or 'female' if recognizable\n- ICD-10 codes should be preserved as-is; if absent, infer from text context\n- For prices/amounts in the source: preserve as-is in IDR (do NOT convert currencies)\n- If a field is genuinely absent or unmappable, use null or empty arrays\n- Provide a brief _mappingNotes explaining your interpretation decisions`,
      { temperature: 0.1 },
    );

    return { data: object, usage };
  }

  async estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      estimatedLos: z.number().describe('The standard expected length of stay in days.').optional().default(3),
      minLos: z.number().describe('The minimum length of stay typically expected for mild cases.').optional().default(1),
      maxLos: z.number().describe('The maximum length of stay typically expected before complications are considered.').optional().default(7),
      justification: z.string().describe('Clinical justification for this LOS based on standard Indonesian or international medical guidelines.').optional().default('Standard general admission length of stay.'),
      references: z.array(z.string()).describe('Sources or guidelines used for this estimation (e.g. Kemenkes, WHO).').optional().default([]),
    });

    const { object, usage } = await this.generateObject(
      schema,
      `Perform a deep clinical research for the expected Length of Stay (LOS) for the following diagnosis:\nDiagnosis Code: ${diagnosisCode}\nDiagnosis Name: ${diagnosisName}\n\nRules:\n1. Provide the standard expected LOS in days for an inpatient admission. If this diagnosis is typically outpatient, estimate the LOS if an admission was deemed medically necessary.\n2. Provide the typical minimum and maximum LOS bounds.\n3. Provide a clear clinical justification based on standard treatment protocols, focusing on why this duration is needed (e.g., IV antibiotics duration, observation periods).\n4. List the medical guidelines or references used (e.g., Kemenkes PNPK, WHO guidelines, or general clinical consensus).`,
      `You are an expert clinical coding and pathway analyst specializing in the Indonesian healthcare system (JKN/BPJS). Your task is to provide a highly accurate estimation of the Length of Stay (LOS) for a given diagnosis.`,
      { temperature: 0.2 },
    );

    return { data: object, usage };
  }

  /**
   * Custom resilient generateObject for providers that use the OpenAI chat protocol
   * but do not enforce structured output server-side (e.g. SumoPod, local models).
   *
   * Flow:
   *   1. Call generateText with a JSON-mode prompt injection
   *   2. Strip markdown fences, extract JSON object from text
   *   3. Unwrap any $ref/definitions schema wrappers hallucinated by the model
   *   4. Run optional domain-specific normalizer (e.g. pathway phase unwrapping)
   *   5. Run coerceToSchema — generic model-agnostic type coercion
   *   6. Validate with Zod
   */
  private async generateObject<T>(
    schema: z.ZodType<T>,
    prompt: string,
    system?: string,
    options: { temperature?: number } = {},
    normalizer?: (raw: unknown) => unknown,
  ): Promise<{ object: T; usage?: Usage }> {
    const schemaString = JSON.stringify(zodToJsonSchema(schema as any, "OutputSchema"), null, 2);
    const jsonInstruction = `You are in Vercel AI SDK generateObject-compatible mode.
Follow the user task exactly and return the same kind of high-quality, clinically useful result expected from the Vercel driver.

Return ONLY one valid JSON object containing the ANSWER DATA that matches the JSON Schema below.
Do NOT return the JSON Schema itself. Do NOT include "$schema", "$ref", "definitions", "properties", or other schema metadata as answer fields. Only include a key named "type" when the answer schema explicitly defines that domain field.
Do NOT wrap in markdown code blocks. Do NOT add commentary outside JSON.
Use camelCase for all keys and fill every required field with task-relevant values.
If evidence is unavailable, use the schema-appropriate empty value (0, null, [], or "") instead of inventing facts.

EXPECTED ANSWER JSON SCHEMA (contract only, not the answer):
${schemaString}`;

    const messages: any[] = [
      { role: 'system', content: system ? `${system}\n\n${jsonInstruction}` : jsonInstruction },
      { role: 'user', content: prompt },
    ];

    const { text, usage } = await generateText({
      model: this.ai(this.defaultModel),
      messages,
      maxOutputTokens: this.maxTokens,
      temperature: options.temperature ?? this.temperature,
    });

    console.log(`\n--- [SumoPod AI] RAW RESPONSE START ---`);
    console.log(text);
    console.log(`--- [SumoPod AI] RAW RESPONSE END ---\n`);

    // Step 1: Parse JSON from text (strip markdown fences if any)
    let parsed: unknown;
    try {
      parsed = parseJsonFromText(text);
    } catch (parseError) {
      console.error(`[SumoPod AI] JSON Parse Error:`, parseError);
      throw parseError;
    }

    // Step 2: Unwrap $ref/definitions wrapper hallucinated by some models
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (obj['$ref'] === '#/definitions/OutputSchema' && obj['definitions']) {
        const inner = (obj['definitions'] as Record<string, unknown>)['OutputSchema'];
        if (inner && typeof inner === 'object') parsed = inner;
      }
    }

    // Step 3: Domain-specific normalizer (optional, e.g. pathway phase unwrapping)
    const normalized = normalizer ? normalizer(parsed) : parsed;

    // Step 4: Generic schema coercion — handles snake_case, type mismatches, boolean→null, etc.
    const coerced = coerceToSchema(schema as z.ZodTypeAny, normalized);

    // Step 5: Zod validation
    try {
      const object = schema.parse(coerced);
      return { object, usage: usage as any };
    } catch (zodError) {
      console.error(`\n--- [SumoPod AI] ZOD VALIDATION ERROR ---`);
      console.error(`Payload coerced to:`, JSON.stringify(coerced, null, 2));
      console.error(zodError);
      throw zodError;
    }
  }
}

// ---------------------------------------------------------------------------
// Domain-specific normalizer — clinical pathway only
// ---------------------------------------------------------------------------

/**
 * Handles two things coerceToSchema cannot resolve generically:
 * 1. Arbitrary nested wrapper (e.g. { clinical_pathway: { phases: [...] } })
 * 2. nutrition returned as a flat string array instead of { diet, restrictions }
 */
function normalizePathwayPhases(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;

  // Unwrap arbitrary nested wrapper
  if (!obj['phases'] && !obj['phase_list']) {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const nested = val as Record<string, unknown>;
        if (nested['phases']) {
          obj['phases'] = nested['phases'];
          obj['estimatedLos'] = nested['estimatedLos'] ?? nested['estimated_los'] ?? obj['estimatedLos'];
          break;
        }
      }
    }
  }

  if (obj['phase_list'] && !obj['phases']) obj['phases'] = obj['phase_list'];

  const phases = (obj['phases'] ?? []) as Array<unknown>;
  obj['phases'] = phases.map((phase, idx) => {
    if (!phase || typeof phase !== 'object') {
      return { phaseId: `phase-${idx + 1}`, phaseName: 'Phase', dayRange: 'Day 1' };
    }
    const p = phase as Record<string, unknown>;

    // nutrition as string array → { diet, restrictions } (coerceToSchema can't auto-resolve this)
    const nutrition = p['nutrition'];
    if (Array.isArray(nutrition)) {
      p['nutrition'] = { diet: (nutrition as unknown[]).map(String).join('; '), restrictions: [] };
    }

    return p;
  });

  return obj;
}

// ---------------------------------------------------------------------------
// Generic Schema Coercer — model-agnostic, runs before every schema.parse()
// ---------------------------------------------------------------------------

/**
 * Returns the key of the first field in a Zod object shape that resolves to ZodString
 * (after unwrapping Optional/Default wrappers). Used to map plain strings to objects.
 */
function findFirstStringKey(shape: Record<string, z.ZodTypeAny>): string | undefined {
  return Object.keys(shape).find((k) => {
    let s: z.ZodTypeAny = shape[k];
    while (s.constructor.name === 'ZodOptional' || s.constructor.name === 'ZodDefault') {
      s = s.constructor.name === 'ZodOptional'
        ? (s as z.ZodOptional<z.ZodTypeAny>).unwrap()
        : (s as z.ZodDefault<z.ZodTypeAny>)._def.innerType;
    }
    return s.constructor.name === 'ZodString';
  });
}

/**
 * Recursively coerces a raw AI JSON value to match the expected Zod schema type.
 * Model-agnostic — handles all common hallucinations:
 *   - snake_case → camelCase key mapping
 *   - number/boolean → string, string → number
 *   - string → object (maps to first string-typed key in shape)
 */
function coerceToSchema(schema: z.ZodTypeAny, value: unknown): unknown {
  const typeName = schema.constructor.name;

  if (typeName === 'ZodDefault') {
    if (value === undefined || value === null) return undefined;
    return coerceToSchema((schema._def as any).innerType as z.ZodTypeAny, value);
  }
  if (typeName === 'ZodOptional') {
    if (value === undefined) return undefined;
    return coerceToSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap(), value);
  }
  if (typeName === 'ZodNullable') {
    if (value === null || value === undefined || value === false) return null;
    return coerceToSchema((schema as z.ZodNullable<z.ZodTypeAny>).unwrap(), value);
  }
  if (typeName === 'ZodString') {
    if (typeof value !== 'string') return value != null ? String(value) : value;
    return value;
  }
  if (typeName === 'ZodNumber') {
    if (typeof value === 'string') { const n = Number(value); if (!isNaN(n)) return n; }
    return value;
  }
  if (typeName === 'ZodBoolean') {
    if (typeof value !== 'boolean') return Boolean(value);
    return value;
  }
  if (typeName === 'ZodArray') {
    const itemSchema = (schema as z.ZodArray<z.ZodTypeAny>).element;
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) return [coerceToSchema(itemSchema, value)];
    return (value as unknown[]).map((item) => coerceToSchema(itemSchema, item));
  }
  if (typeName === 'ZodObject') {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape as Record<string, z.ZodTypeAny>;
    if (value === false) return null;
    if (value === true) return {};
    if (typeof value === 'string') {
      const primaryKey = findFirstStringKey(shape);
      if (primaryKey) return coerceToSchema(schema, { [primaryKey]: value });
      return value;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

    const raw = value as Record<string, unknown>;
    const result: Record<string, unknown> = { ...raw };

    for (const camelKey of Object.keys(shape)) {
      if (!(camelKey in result)) {
        const snakeKey = camelKey.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        if (snakeKey in raw) result[camelKey] = raw[snakeKey];
      }
      if (camelKey in result) {
        result[camelKey] = coerceToSchema(shape[camelKey], result[camelKey]);
      }
    }

    return result;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error(`SumoPod AI mengembalikan JSON tidak valid: ${trimmed.slice(0, 300)}`);
  }
}
