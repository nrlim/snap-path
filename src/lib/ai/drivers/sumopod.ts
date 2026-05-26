import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AIGatewayDriver, AIMessage, Usage } from '../gateway';

interface SumoPodContentPart {
  type?: string;
  text?: string;
}

interface SumoPodChatChoice {
  text?: string;
  finish_reason?: string;
  message?: {
    content?: string | SumoPodContentPart[] | null;
    reasoning_content?: string | null;
  };
}

interface SumoPodChatResponse {
  choices?: SumoPodChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

interface SumoPodCompletionInput {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  budgetTokens?: number;
  jsonMode?: boolean;
}

const DEFAULT_SUMOPOD_BASE_URL = 'https://ai.sumopod.com/v1';
const DEFAULT_SUMOPOD_MODEL = 'gpt-4o-mini';

export class SumoPodAIDriver implements AIGatewayDriver {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private budgetTokens?: number;

  constructor(apiKey?: string, baseUrl?: string, model?: string, maxTokens?: number, temperature?: number, budgetTokens?: number) {
    this.apiKey = apiKey || process.env.SUMOPOD_API_KEY || '';
    this.baseUrl = baseUrl || process.env.SUMOPOD_BASE_URL || DEFAULT_SUMOPOD_BASE_URL;
    this.model = model || process.env.SUMOPOD_MODEL || DEFAULT_SUMOPOD_MODEL;
    this.maxTokens = maxTokens || 1500;
    this.temperature = temperature ?? 0.7;
    this.budgetTokens = budgetTokens ?? parsePositiveInt(process.env.SUMOPOD_BUDGET_TOKENS);
  }

  async generateText(prompt: string, context?: AIMessage[]): Promise<{ text: string; usage?: Usage }> {
    const result = await this.complete({
      messages: this.buildMessages(prompt, context),
      temperature: this.temperature,
    });

    return { text: result.text, usage: result.usage };
  }

  async extractMedicalData(clinicalText: string): Promise<{ data: Record<string, unknown>; usage?: Usage }> {
    const result = await this.completeJson(
      z.record(z.string(), z.unknown()),
      `Extract structured medical entities from the following text:\n\n${clinicalText}`,
    );

    return { data: result.data, usage: result.usage };
  }

  async validateDiagnosisTreatment(payload: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      isValid: z.boolean(),
      score: z.number().min(0).max(100),
      details: z.array(z.object({
        diagnosisCode: z.string(),
        diagnosisName: z.string(),
        clinicalSummary: z.string(),
        matchedProcedures: z.array(z.string()),
        unmatchedProcedures: z.array(z.string()),
        missingRequiredProcedures: z.array(z.string()),
        suggestedProcedures: z.array(z.object({ code: z.string(), name: z.string(), rationale: z.string() })),
        notes: z.string(),
      })),
    });

    const result = await this.completeJson(schema, `You are a clinical pathway validation expert for Indonesian healthcare (JKN/BPJS context). Analyze the following claim for medical necessity and diagnosis-treatment appropriateness:\n\n${JSON.stringify(payload, null, 2)}\n\nFor each diagnosis:\n1. Assess if the claimed procedures and medications are appropriate.\n2. Identify mismatched or irrelevant procedures.\n3. Suggest additional procedures that are clinically relevant but NOT yet claimed (for admision review).\n4. Provide a brief clinical summary of the condition for admision context.\nBase your analysis on standard Indonesian medical guidelines and clinical pathways.`);
    return { data: result.data, usage: result.usage };
  }

  async searchDrugMarketPrice(drug: string | { name: string; genericName?: string | null; dosage?: string | null }): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      marketPriceMax: z.number(),
      marketPriceAvg: z.number().nullable(),
      sources: z.array(z.string()),
      resolvedProductName: z.string(),
      dosageForm: z.string(),
      unitBasis: z.string(),
    });
    const drugContext = typeof drug === 'string'
      ? { name: drug, genericName: null, dosage: null }
      : { name: drug.name, genericName: drug.genericName || null, dosage: drug.dosage || null };

    const system = `You are a senior Indonesian hospital pharmacist and pricing analyst with deep knowledge of the Indonesian pharmaceutical market (e-Katalog LKPP, HET/HNA regulations, and retail pharmacy pricing).

Your expertise includes:
- Indonesian generic drug pricing (obat generik berlogo / OGB) vs branded generics vs paten/originator
- e-Katalog LKPP government procurement prices as baseline references
- Retail pharmacy pricing from K24, Kimia Farma, Century, Halodoc, Farmaku, Lifepack, GoApotik
- Hospital markup patterns (typically 10-30% above HNA for most items)
- Dosage form identification: infusion fluids, injection vials/ampoules, oral tablets/capsules, syrups, etc.

CRITICAL PRICING CONTEXT for Indonesian market (use as sanity check):
- IV Fluid (Ringer Lactate / NaCl 0.9% 500ml): Rp 10.000 - Rp 30.000 per bottle
- Paracetamol 500mg tablet (generic): Rp 300 - Rp 1.500 per tablet
- Paracetamol Syrup 120mg/5ml 60ml: Rp 8.000 - Rp 25.000 per bottle
- Ceftriaxone 1g injection vial (generic): Rp 25.000 - Rp 80.000 per vial
- Amoxicillin 500mg capsule (generic): Rp 500 - Rp 2.000 per capsule
- Omeprazole 20mg capsule (generic): Rp 800 - Rp 3.000 per capsule
- Ranitidine 150mg tablet (generic): Rp 300 - Rp 1.500 per tablet
- Metformin 500mg tablet (generic): Rp 300 - Rp 1.200 per tablet
- Ciprofloxacin 500mg tablet (generic): Rp 500 - Rp 3.000 per tablet
- Ondansetron 4mg injection ampoule: Rp 5.000 - Rp 25.000 per ampoule

These ranges are GUIDELINES. Your verified sources may show prices within or slightly outside these ranges, which is acceptable. But if your research returns a price that is 3x or more above these ranges, you MUST re-verify and explain why (e.g., originator brand, special formulation, etc).

You must be CONSERVATIVE and AUDITABLE. Never fabricate prices, URLs, or sources.`;
    const prompt = `Perform a deep pharmaceutical price research for this medication in the Indonesian market:

${JSON.stringify(drugContext, null, 2)}

STEP-BY-STEP ANALYSIS REQUIRED:

Step 1: IDENTIFY THE PRODUCT
- Parse the drug name to identify: active ingredient, strength/concentration, dosage form (tablet, capsule, syrup, injection vial, injection ampoule, IV infusion bottle, etc.)
- If the name contains "IV Fluid" or "Infusion" → this is an infusion fluid bottle, NOT an injection
- If the name contains "Injection" or "Inj" → identify if it's a vial or ampoule
- If the name contains "Tablet" or "Tab" or "Capsule" or "Cap" → oral solid dosage form
- If the name contains "Syrup" or "Suspension" or "Drops" → oral liquid dosage form
- Determine if this is likely a generic (OGB), branded generic, or originator/patent drug

Step 2: RESEARCH PRICING
- Search for the GENERIC version first (most Indonesian hospital claims use generic drugs)
- Check e-Katalog LKPP pricing as a baseline (government procurement price)
- Check retail pharmacy prices from: K24Klik, Halodoc, Farmaku, Lifepack, GoApotik, KlikDokter, Alodokter
- For hospital context, generic drug prices should be the primary reference

Step 3: CALCULATE UNIT PRICE
- Convert ALL found prices to the same unit basis that matches the claim context:
  * For tablets/capsules: price per tablet/capsule (NOT per strip or per box)
  * For injection vials: price per vial
  * For injection ampoules: price per ampoule
  * For IV infusion fluids: price per bottle (e.g., per 500ml bottle)
  * For syrups/suspensions: price per bottle
- Show the conversion calculation explicitly in sources
- Example: "Strip 10 tablet @ Rp 15.000 → Rp 1.500/tablet"
- Example: "Box 25 vial @ Rp 750.000 → Rp 30.000/vial"

Step 4: SANITY CHECK
- Compare your final unit price against the pricing context provided in the system prompt
- If the price seems unreasonably high or low, re-examine your sources
- A hospital claim price for a common generic drug should typically be within the ranges provided

OUTPUT RULES:
1. marketPriceMax = the highest verified UNIT price found (converted to per-unit basis)
2. marketPriceAvg = average of verified UNIT prices (null if < 2 sources)
3. If you cannot find ANY reliable Indonesian pharmacy source, return marketPriceMax: 0, marketPriceAvg: null, sources: []
4. Do NOT hallucinate or estimate prices without source evidence
5. Each source entry MUST include: source_name | exact_product_matched | package_info | package_price | unit_conversion | per_unit_price | URL_or_reference`;

    const result = await this.completeJson(schema, prompt, system, { temperature: 0.1 });
    return { data: result.data, usage: result.usage };
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }> {
    // Lenient schema: all phase sub-fields are optional with sensible defaults
    // so a partial AI response can still be parsed and used gracefully.
    const assessmentSchema = z.object({
      name: z.string().optional().default('Assessment'),
      frequency: z.string().optional().default('As needed'),
      mandatory: z.boolean().optional().default(false),
    });
    const treatmentSchema = z.object({
      name: z.string().optional().default('Treatment'),
      route: z.string().nullable().optional().default(null),
      mandatory: z.boolean().optional().default(false),
    });
    const medicationSchema = z.object({
      name: z.string().optional().default('Medication'),
      dosage: z.string().optional().default('-'),
      frequency: z.string().optional().default('-'),
      route: z.string().optional().default('oral'),
      duration: z.string().optional().default('-'),
      mandatory: z.boolean().optional().default(false),
    });
    const nursingSchema = z.object({
      activity: z.string().optional().default('Nursing activity'),
      frequency: z.string().optional().default('As needed'),
    });

    const schema = z.object({
      estimatedLos: z.number().optional().default(3),
      phases: z.array(z.object({
        phaseId: z.string().optional().default(''),
        phaseName: z.string().optional().default('Phase'),
        dayRange: z.string().optional().default('Day 1'),
        objectives: z.array(z.string()).optional().default([]),
        assessments: z.array(assessmentSchema).optional().default([]),
        treatments: z.array(treatmentSchema).optional().default([]),
        medications: z.array(medicationSchema).optional().default([]),
        nursing: z.array(nursingSchema).optional().default([]),
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

    const prompt = `Generate a realistic clinical pathway for ${diagnosisCode} - ${diagnosisName} suitable for Indonesian healthcare context.

Requirements:
1. Estimate the standard Length of Stay (LOS) for this diagnosis using general clinical knowledge and publicly known practice patterns when no internal master LOS is available.
2. Return estimatedLos as the expected inpatient duration in days. For outpatient/IGD-only cases, use 1 unless the diagnosis usually requires observation/admission.
3. Break phases according to the estimatedLos. Do NOT always force a static 3-day pathway.
4. The phases array may group clinically similar adjacent days, but the grouped dayRange MUST clearly cover the entire estimatedLos from Day 1 through Day N. Example for estimatedLos 7: "Day 1", "Day 2-3", "Day 4-6", "Day 7".
5. Do not stop before the estimatedLos. The final phase dayRange must include the last LOS day.
6. Use phaseName as the clinical activity title only, e.g. "Admission", "Treatment", "Monitoring", "Discharge". Avoid putting day labels inside phaseName.
7. Include discharge criteria in the final phase.
8. Use camelCase for ALL JSON keys: phaseId, phaseName, dayRange, objectives, assessments, treatments, medications, nursing, nutrition, education, dischargeGate, mustMeetAll.

Generate a clinically realistic and auditable pathway for Indonesian healthcare review context.`;

    // Pre-parse: normalise snake_case keys AI sometimes returns
    const result = await this.completeJson(schema, prompt, undefined, {}, normalizePathwayPhases);
    return { data: result.data, usage: result.usage };
  }

  async validateDocumentCompleteness(payload: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      isValid: z.boolean(),
      score: z.number(),
      details: z.object({
        providedDocuments: z.array(z.string()),
        missingRequiredDocuments: z.array(z.string()),
        notes: z.string(),
      }),
    });

    const result = await this.completeJson(schema, `Analyze the following claim for document completeness:\n\n${JSON.stringify(payload, null, 2)}\n\nRequired documents are exactly: LMA, KTP, KARTU ASURANSI, SK KAMAR, FORM KRONOLOGIS KECELAKAAN, and SURAT PERNYATAAN RAWAT INAP. Identify any missing required documents from this list only.`);
    return { data: result.data, usage: result.usage };
  }

  async mapArbitraryJsonToClaim(rawJson: any): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      patient: z.object({ name: z.string(), birthDate: z.string().nullable(), gender: z.enum(['male', 'female', 'M', 'F', 'L', 'P', 'Laki-Laki', 'Perempuan', '']).nullable(), identifier: z.array(z.object({ value: z.string() })) }),
      encounter: z.object({ class: z.object({ code: z.string() }), period: z.object({ start: z.string().nullable(), end: z.string().nullable() }) }),
      diagnoses: z.array(z.object({ code: z.string().nullable(), name: z.string(), type: z.enum(['primary', 'secondary', 'complication']) })),
      procedures: z.array(z.object({ code: z.string().nullable(), name: z.string(), quantity: z.number().nullable(), price: z.number().nullable() })),
      medications: z.array(z.object({ name: z.string(), quantity: z.number().nullable(), price: z.number().nullable() })),
      documents: z.array(z.object({ type: z.string(), conclusion: z.string().nullable() })),
      extra: z.object({ insuranceNumber: z.string().nullable(), los: z.string().nullable(), nik: z.string().nullable(), insuranceType: z.string().nullable() }),
      _mappingNotes: z.string(),
    });

    const system = `You are a medical data integration expert specializing in Indonesian healthcare (JKN/BPJS).
Your task is to analyze an arbitrary JSON payload from any hospital system (SIMRS, SIRS, HL7 FHIR, custom export, etc.) and intelligently map its fields to the SnapPath claim validation schema.
Rules:
- Map dates to ISO 8601 format
- Normalize gender to 'male' or 'female' if recognizable
- ICD-10 codes should be preserved as-is; if absent, infer from text context
- For prices/amounts in the source: preserve as-is in IDR (do NOT convert currencies)
- If a field is genuinely absent or unmappable, use null or empty arrays
- Provide a brief _mappingNotes explaining your interpretation decisions`;
    const result = await this.completeJson(schema, `Map the following JSON to SnapPath claim structure:\n\n${JSON.stringify(rawJson, null, 2)}`, system, { temperature: 0.1 });
    return { data: result.data, usage: result.usage };
  }

  async estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }> {
    const schema = z.object({
      estimatedLos: z.number(),
      minLos: z.number(),
      maxLos: z.number(),
      justification: z.string(),
      references: z.array(z.string()),
    });

    const system = `You are an expert clinical coding and pathway analyst specializing in the Indonesian healthcare system (JKN/BPJS). Your task is to provide a highly accurate estimation of the Length of Stay (LOS) for a given diagnosis.`;
    const prompt = `Perform a deep clinical research for the expected Length of Stay (LOS) for the following diagnosis:
Diagnosis Code: ${diagnosisCode}
Diagnosis Name: ${diagnosisName}

Rules:
1. Provide the standard expected LOS in days for an inpatient admission. If this diagnosis is typically outpatient, estimate the LOS if an admission was deemed medically necessary.
2. Provide the typical minimum and maximum LOS bounds.
3. Provide a clear clinical justification based on standard treatment protocols, focusing on why this duration is needed (e.g., IV antibiotics duration, observation periods).
4. List the medical guidelines or references used (e.g., Kemenkes PNPK, WHO guidelines, or general clinical consensus).`;
    const result = await this.completeJson(schema, prompt, system, { temperature: 0.2 });
    return { data: result.data, usage: result.usage };
  }

  private buildMessages(prompt: string, context?: AIMessage[]): AIMessage[] {
    const messages = [...(context || [])];
    if (prompt) messages.push({ role: 'user', content: prompt });
    return messages;
  }

  private async completeJson<T>(schema: z.ZodType<T>, prompt: string, system?: string, options: { temperature?: number } = {}, normalizer?: (raw: unknown) => unknown): Promise<{ data: T; usage?: Usage }> {
    const jsonSchemaString = JSON.stringify(zodToJsonSchema(schema as any, "OutputSchema"), null, 2);
    const jsonInstruction = `Return only valid JSON matching the requested schema. Do not wrap in markdown. Do not include commentary. The JSON MUST conform to the following JSON Schema:\n\n${jsonSchemaString}`;
    const messages: AIMessage[] = [
      ...(system ? [{ role: 'system' as const, content: `${system}\n\n${jsonInstruction}` }] : [{ role: 'system' as const, content: jsonInstruction }]),
      { role: 'user', content: prompt },
    ];

    const result = await this.complete({ messages, temperature: options.temperature ?? this.temperature, jsonMode: true });
    const parsed = parseJsonObject(result.text);
    const normalized = normalizer ? normalizer(parsed) : parsed;
    return { data: schema.parse(normalized), usage: result.usage };
  }

  private async complete(input: SumoPodCompletionInput): Promise<{ text: string; usage?: Usage }> {
    if (!this.apiKey) {
      throw new Error('SUMOPOD_API_KEY belum dikonfigurasi di environment server.');
    }

    const response = await this.request(input);
    const content = extractContent(response.payload);
    if (content) return { text: content, usage: normalizeUsage(response.payload) };

    throw new Error(`SumoPod AI tidak mengembalikan konten. finish_reason=${response.payload.choices?.[0]?.finish_reason ?? 'unknown'}`);
  }

  private async request(input: SumoPodCompletionInput): Promise<{ payload: SumoPodChatResponse }> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: input.messages,
      max_tokens: input.maxTokens ?? this.maxTokens,
      temperature: input.temperature ?? this.temperature,
    };

    const budgetTokens = input.budgetTokens ?? this.safeBudgetTokens(input.maxTokens ?? this.maxTokens);
    if (budgetTokens != null) body.budget_tokens = budgetTokens;
    if (input.jsonMode && process.env.SUMOPOD_JSON_MODE !== 'false') body.response_format = { type: 'json_object' };

    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    };

    const response = await fetch(endpoint, init);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`SumoPod AI gagal (${response.status}): ${message || response.statusText}`);
    }

    return { payload: await response.json() as SumoPodChatResponse };
  }

  private safeBudgetTokens(maxTokens: number): number | undefined {
    if (this.budgetTokens == null || this.budgetTokens <= 0) return undefined;
    return Math.min(this.budgetTokens, Math.floor(maxTokens * 0.4));
  }
}

/**
 * Normalizes a raw AI-generated clinical pathway object to match our camelCase schema.
 * Models sometimes return snake_case variants (phase_id, day_range, discharge_gate, etc.)
 * This remaps them before Zod validation.
 */
function normalizePathwayPhases(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;

  function coerceKey(record: Record<string, unknown>, snake: string, camel: string) {
    if (camel in record) return; // already camelCase, nothing to do
    if (snake in record) record[camel] = record[snake];
  }

  // Top-level key aliases
  coerceKey(obj, 'estimated_los', 'estimatedLos');

  const phases = (obj['phases'] ?? obj['phase_list'] ?? []) as Array<Record<string, unknown>>;
  obj['phases'] = phases.map((phase, idx) => {
    coerceKey(phase, 'phase_id', 'phaseId');
    coerceKey(phase, 'phase_name', 'phaseName');
    coerceKey(phase, 'day_range', 'dayRange');
    coerceKey(phase, 'discharge_gate', 'dischargeGate');

    // Auto-generate phaseId if still missing
    if (!phase['phaseId']) phase['phaseId'] = `phase-${idx + 1}`;

    // Normalize dischargeGate
    const dg = phase['dischargeGate'];
    if (dg && typeof dg === 'object') {
      const dgObj = dg as Record<string, unknown>;
      coerceKey(dgObj, 'must_meet_all', 'mustMeetAll');
      coerceKey(dgObj, 'meet_all', 'mustMeetAll');
    }

    // Normalize nutrition
    const nutrition = phase['nutrition'];
    if (nutrition && typeof nutrition === 'object') {
      const nObj = nutrition as Record<string, unknown>;
      if (!nObj['diet']) nObj['diet'] = nObj['dietary_plan'] ?? nObj['dietary_recommendation'] ?? 'Diet sesuai kondisi';
    }

    // Normalize assessments
    if (Array.isArray(phase['assessments'])) {
      phase['assessments'] = (phase['assessments'] as Array<Record<string, unknown>>).map((a) => {
        coerceKey(a, 'assessment_name', 'name');
        coerceKey(a, 'is_mandatory', 'mandatory');
        return a;
      });
    }

    // Normalize treatments
    if (Array.isArray(phase['treatments'])) {
      phase['treatments'] = (phase['treatments'] as Array<Record<string, unknown>>).map((t) => {
        coerceKey(t, 'treatment_name', 'name');
        coerceKey(t, 'is_mandatory', 'mandatory');
        return t;
      });
    }

    // Normalize medications
    if (Array.isArray(phase['medications'])) {
      phase['medications'] = (phase['medications'] as Array<Record<string, unknown>>).map((m) => {
        coerceKey(m, 'medication_name', 'name');
        coerceKey(m, 'is_mandatory', 'mandatory');
        return m;
      });
    }

    // Normalize nursing
    if (Array.isArray(phase['nursing'])) {
      phase['nursing'] = (phase['nursing'] as Array<Record<string, unknown>>).map((n) => {
        coerceKey(n, 'nursing_activity', 'activity');
        coerceKey(n, 'nursing_action', 'activity');
        return n;
      });
    }

    return phase;
  });

  return obj;
}

function extractContent(payload: SumoPodChatResponse): string | null {
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content.map((part) => part.text ?? '').join('\n').trim();
    if (text) return text;
  }
  if (choice?.text?.trim()) return choice.text;
  if (choice?.message?.reasoning_content?.trim()) return choice.message.reasoning_content;
  if (payload.error?.message) return payload.error.message;

  return null;
}

function normalizeUsage(payload: SumoPodChatResponse): Usage | undefined {
  const usage = payload.usage;
  if (!usage) return undefined;
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    inputTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
  };
}

function parseJsonObject(text: string): unknown {
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

function parsePositiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

