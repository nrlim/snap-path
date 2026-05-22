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

  async searchDrugMarketPrice(drugName: string): Promise<{ data: any; usage?: { promptTokens: number; completionTokens: number } }> {
    const schema = z.object({
      marketPriceMax: z.number(),
      marketPriceAvg: z.number().nullable(),
      sources: z.array(z.string())
    });

    const { object, usage } = await generateObject({
      model: this.ai(this.defaultModel),
      schema,
      prompt: `Find the highest and average market price in Indonesian Rupiah (IDR) for the drug: "${drugName}". Only provide factual data from online pharmacies (e.g., Halodoc, Alodokter, K24). If exact data is unavailable, provide a realistic estimate and list the sources used.`,
      temperature: this.temperature,
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
      prompt: `Generate a realistic clinical pathway for ${diagnosisCode} - ${diagnosisName} suitable for Indonesian healthcare context. Break it down into phases (e.g., Admission, Day 1-2, Discharge).`,
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
      prompt: `Analyze the following claim for document completeness:\n\n${JSON.stringify(payload, null, 2)}\n\nDetermine if the provided documents are sufficient based on standard medical claims requirements (e.g. KTP, RESUME_MEDIS, HASIL_LAB, HASIL_RADIOLOGI, LAPORAN_OPERASI). Identify any missing mandatory documents.`,
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
        type: z.string().describe('e.g. KTP, RESUME_MEDIS, HASIL_LAB, SURAT_RUJUKAN'),
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
}

