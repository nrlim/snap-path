import { generateText, generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { AIGatewayDriver, AIMessage } from '../gateway';

export class OpenAIDriver implements AIGatewayDriver {
  private ai: ReturnType<typeof createOpenAI>;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(apiKey: string, baseURL?: string, model?: string, maxTokens?: number, temperature?: number) {
    // This allows connecting to Vercel AI Gateway, Sumopod, or direct OpenAI
    this.ai = createOpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.openai.com/v1',
    });
    this.defaultModel = model || 'gpt-4o-mini';
    this.maxTokens = maxTokens || 1500;
    this.temperature = temperature ?? 0.7;
  }

  async generateText(prompt: string, context?: AIMessage[]): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }> {
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

  async extractMedicalData(clinicalText: string): Promise<{ data: Record<string, unknown>; usage?: { promptTokens: number; completionTokens: number } }> {
    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema: z.record(z.string(), z.unknown()), // Generic fallback, but you should use specific schemas for real data
      prompt: `Extract structured medical entities from the following text:\n\n${clinicalText}`,
      temperature: this.temperature,
    });

    return { data: object, usage: usage as any };
  }
  
  async validateDiagnosisTreatment(payload: any): Promise<{ data: any; usage?: { promptTokens: number; completionTokens: number } }> {
    const schema = z.object({
      isValid: z.boolean(),
      score: z.number().min(0).max(100),
      details: z.array(z.object({
        diagnosisCode: z.string(),
        diagnosisName: z.string().describe('Human-readable name of the diagnosis'),
        clinicalSummary: z.string().describe('Brief 2-3 sentence clinical summary of this condition for admision context'),
        matchedProcedures: z.array(z.string()),
        unmatchedProcedures: z.array(z.string()),
        missingRequiredProcedures: z.array(z.string()),
        suggestedProcedures: z.array(z.object({
          code: z.string().describe('Procedure code e.g. ICD-9 or local code'),
          name: z.string().describe('Human-readable procedure name'),
          rationale: z.string().describe('Why this procedure is relevant to the diagnosis')
        })).describe('Procedures relevant to this diagnosis that were NOT claimed, AI-suggested for admision review'),
        notes: z.string()
      }))
    });

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      prompt: `You are a clinical pathway validation expert for Indonesian healthcare (JKN/BPJS context). Analyze the following claim for medical necessity and diagnosis-treatment appropriateness:\n\n${JSON.stringify(payload, null, 2)}\n\nFor each diagnosis:\n1. Assess if the claimed procedures and medications are appropriate.\n2. Identify mismatched or irrelevant procedures.\n3. Suggest additional procedures that are clinically relevant but NOT yet claimed (for admision review).\n4. Provide a brief clinical summary of the condition for admision context.\nBase your analysis on standard Indonesian medical guidelines and clinical pathways.`,
      temperature: this.temperature,
    });

    return { data: object, usage: usage as any };
  }

  async searchDrugMarketPrice(drug: string | { name: string; genericName?: string | null; dosage?: string | null }): Promise<{ data: any; usage?: { promptTokens: number; completionTokens: number } }> {
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
      system: `You are a senior Indonesian hospital pharmacist and pricing analyst with deep knowledge of the Indonesian pharmaceutical market (e-Katalog LKPP, HET/HNA regulations, and retail pharmacy pricing).

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

You must be CONSERVATIVE and AUDITABLE. Never fabricate prices, URLs, or sources.`,
      prompt: `Perform a deep pharmaceutical price research for this medication in the Indonesian market:

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
5. Each source entry MUST include: source_name | exact_product_matched | package_info | package_price | unit_conversion | per_unit_price | URL_or_reference`,
      temperature: 0.1,
    });

    return { data: object, usage: usage as any };
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: { promptTokens: number; completionTokens: number } }> {
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

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      prompt: `Generate a realistic clinical pathway for ${diagnosisCode} - ${diagnosisName} suitable for Indonesian healthcare context.

Requirements:
1. Estimate the standard Length of Stay (LOS) for this diagnosis using general clinical knowledge and publicly known practice patterns when no internal master LOS is available.
2. Return estimatedLos as the expected inpatient duration in days. For outpatient/IGD-only cases, use 1 unless the diagnosis usually requires observation/admission.
3. Break phases according to the estimatedLos. Do NOT always force a static 3-day pathway.
4. The phases array may group clinically similar adjacent days, but the grouped dayRange MUST clearly cover the entire estimatedLos from Day 1 through Day N. Example for estimatedLos 7: "Day 1", "Day 2-3", "Day 4-6", "Day 7".
5. Do not stop before the estimatedLos. The final phase dayRange must include the last LOS day.
6. Use phaseName as the clinical activity title only, e.g. "Admission", "Treatment", "Monitoring", "Discharge". Avoid putting day labels inside phaseName.
7. Include discharge criteria in the final phase.

Generate a clinically realistic and auditable pathway for Indonesian healthcare review context.`,
      temperature: this.temperature,
    });

    return { data: object, usage: usage as any };
  }

  async validateDocumentCompleteness(payload: any): Promise<{ data: any; usage?: { promptTokens: number; completionTokens: number } }> {
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
      prompt: `Analyze the following claim for document completeness:\n\n${JSON.stringify(payload, null, 2)}\n\nRequired documents are exactly: LMA, KTP, KARTU ASURANSI, SK KAMAR, FORM KRONOLOGIS KECELAKAAN, and SURAT PERNYATAAN RAWAT INAP. Identify any missing required documents from this list only.`,
      temperature: this.temperature,
    });

    return { data: object, usage: usage as any };
  }

  async mapArbitraryJsonToClaim(rawJson: any): Promise<{ data: any; usage?: { promptTokens: number; completionTokens: number } }> {
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
      system: systemPrompt,
      prompt: `Map the following JSON to SnapPath claim structure:\n\n${JSON.stringify(rawJson, null, 2)}`,
      temperature: 0.1, // Lower temperature for deterministic mapping
    });

    return { data: object, usage: usage as any };
  }

  async estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: { promptTokens: number; completionTokens: number } }> {
    const schema = z.object({
      estimatedLos: z.number().describe('The standard expected length of stay in days.'),
      minLos: z.number().describe('The minimum length of stay typically expected for mild cases.'),
      maxLos: z.number().describe('The maximum length of stay typically expected before complications are considered.'),
      justification: z.string().describe('Clinical justification for this LOS based on standard Indonesian or international medical guidelines.'),
      references: z.array(z.string()).describe('Sources or guidelines used for this estimation (e.g. Kemenkes, WHO).')
    });

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      system: `You are an expert clinical coding and pathway analyst specializing in the Indonesian healthcare system (JKN/BPJS). Your task is to provide a highly accurate estimation of the Length of Stay (LOS) for a given diagnosis.`,
      prompt: `Perform a deep clinical research for the expected Length of Stay (LOS) for the following diagnosis:
Diagnosis Code: ${diagnosisCode}
Diagnosis Name: ${diagnosisName}

Rules:
1. Provide the standard expected LOS in days for an inpatient admission. If this diagnosis is typically outpatient, estimate the LOS if an admission was deemed medically necessary.
2. Provide the typical minimum and maximum LOS bounds.
3. Provide a clear clinical justification based on standard treatment protocols, focusing on why this duration is needed (e.g., IV antibiotics duration, observation periods).
4. List the medical guidelines or references used (e.g., Kemenkes PNPK, WHO guidelines, or general clinical consensus).`,
      temperature: 0.2,
    });

    return { data: object, usage: usage as any };
  }
}

