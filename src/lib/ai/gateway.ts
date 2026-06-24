export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

import { sanitizeClinicalText, sanitizeClaimValidationInput, sanitizeArbitraryJson } from './sanitizer';

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIGatewayContext {
  clientId?: string | null;
  providerId?: string | null;
  apiKeyId?: string | null;
  jobId?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
}

export interface AIGatewayDriver {
  generateText(prompt: string, context?: AIMessage[]): Promise<{ text: string; usage?: Usage }>;
  extractMedicalData(clinicalText: string): Promise<{ data: Record<string, unknown>; usage?: Usage }>;

  validateDiagnosisTreatment(payload: any): Promise<{ data: any; usage?: Usage }>;
  resolveMedicalItemMatch?(input: { medication: any; diagnoses: any[]; candidates: any[] }): Promise<{ data: any; usage?: Usage }>;
  resolveMedicalItemMatches?(input: { requests: Array<{ requestId: string; medication: any; candidates: any[] }>; diagnoses: any[] }): Promise<{ data: any; usage?: Usage }>;
  generateClinicalPathway(diagnosisCode: string, diagnosisName: string, diagnosisContext?: Array<{ code: string; name?: string; type?: string; sequence?: number }>): Promise<{ data: any; usage?: Usage }>;
  validateDocumentCompleteness(payload: any): Promise<{ data: any; usage?: Usage }>;
  mapArbitraryJsonToClaim(rawJson: any): Promise<{ data: any; usage?: Usage }>;
  estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string, thresholds?: { overstayDays?: number; understayDays?: number }): Promise<{ data: any; usage?: Usage }>;
}

/**
 * AIGateway is a decoupled abstraction over specific AI models (Vercel AI SDK, Custom Gateway, etc.).
 * It ensures the business logic is agnostic to the underlying AI provider.
 */
export class AIGateway {
  private driver: AIGatewayDriver;
  private context: AIGatewayContext;
  private piiRedactPatterns: string[];
  private piiSafeContexts: string[];

  constructor(driver: AIGatewayDriver, context: AIGatewayContext = {}, piiRedactPatterns?: string[], piiSafeContexts?: string[]) {
    this.driver = driver;
    this.context = context;
    this.piiRedactPatterns = piiRedactPatterns || [];
    this.piiSafeContexts = piiSafeContexts || [];
  }

  private async track<T extends { usage?: Usage }>(operation: string, action: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let statusCode = 200;
    let usage: Usage | undefined;

    try {
      const result = await action();
      usage = result.usage;
      return result;
    } catch (error) {
      statusCode = 500;
      throw error;
    } finally {
      const inputTokens = usage?.promptTokens ?? usage?.inputTokens ?? 0;
      const outputTokens = usage?.completionTokens ?? usage?.outputTokens ?? 0;

      await recordApiUsage({
        apiKeyId: this.context.apiKeyId,
        clientId: this.context.clientId,
        providerId: this.context.providerId,
        jobId: this.context.jobId,
        endpoint: `AI:${operation}`,
        method: 'POST',
        statusCode,
        requestType: 'AI',
        aiProvider: this.context.aiProvider,
        aiModel: this.context.aiModel,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startTime,
      });

      if (statusCode < 500 && this.context.clientId && (inputTokens > 0 || outputTokens > 0)) {
        const creditAmount = estimateAIUsageCredit({
          aiModel: this.context.aiModel,
          inputTokens,
          outputTokens,
        });
        await debitClientCreditUsage({
          clientId: this.context.clientId,
          amount: creditAmount,
          jobId: this.context.jobId,
          operation,
        });
      }
    }
  }

  async summarizePathway(clinicalText: string) {
    return this.track('summarizePathway', () => this.driver.generateText(
      "Ringkas teks rekam medis berikut menjadi pathway deterministik yang jelas.",
      [{ role: "user", content: sanitizeClinicalText(clinicalText) }]
    ));
  }

  async extractEntities(clinicalText: string) {
    return this.track('extractMedicalData', () => this.driver.extractMedicalData(sanitizeClinicalText(clinicalText)));
  }

  async validateDiagnosisTreatment(payload: any) {
    return this.track('validateDiagnosisTreatment', () => this.driver.validateDiagnosisTreatment(sanitizeClaimValidationInput(payload)));
  }

  async resolveMedicalItemMatch(input: { medication: any; diagnoses: any[]; candidates: any[] }) {
    if (!this.driver.resolveMedicalItemMatch) return { data: { selectedCandidateId: null, confidence: 'LOW', reason: 'Resolver tidak tersedia.' } };
    return this.track('resolveMedicalItemMatch', () => this.driver.resolveMedicalItemMatch!(input));
  }

  async resolveMedicalItemMatches(input: { requests: Array<{ requestId: string; medication: any; candidates: any[] }>; diagnoses: any[] }) {
    if (this.driver.resolveMedicalItemMatches) {
      return this.track('resolveMedicalItemMatches', () => this.driver.resolveMedicalItemMatches!(input));
    }

    const matches = [];
    for (const request of input.requests) {
      if (!this.driver.resolveMedicalItemMatch) {
        matches.push({ requestId: request.requestId, selectedCandidateId: null, confidence: 'LOW', reason: 'Resolver tidak tersedia.' });
        continue;
      }
      const resolved = await this.driver.resolveMedicalItemMatch({ medication: request.medication, diagnoses: input.diagnoses, candidates: request.candidates });
      matches.push({ requestId: request.requestId, ...resolved.data });
    }
    return { data: { matches } };
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string, diagnosisContext?: Array<{ code: string; name?: string; type?: string; sequence?: number }>) {
    return this.track('generateClinicalPathway', () => this.driver.generateClinicalPathway(diagnosisCode, diagnosisName, diagnosisContext));
  }

  async validateDocumentCompleteness(payload: any) {
    return this.track('validateDocumentCompleteness', () => this.driver.validateDocumentCompleteness(payload));
  }

  async mapArbitraryJsonToClaim(rawJson: any, skipPiiRedaction = false) {
    const payloadToMap = skipPiiRedaction ? rawJson : sanitizeArbitraryJson(rawJson, this.piiRedactPatterns, this.piiSafeContexts);
    return this.track('mapArbitraryJsonToClaim', () => this.driver.mapArbitraryJsonToClaim(payloadToMap));
  }

  async estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string, thresholds?: { overstayDays?: number; understayDays?: number }) {
    return this.track('estimateDiagnosisLos', () => this.driver.estimateDiagnosisLos(diagnosisCode, diagnosisName, thresholds));
  }
}

// Singleton helper to get default configured gateway
import { VercelAIDriver } from './drivers/vercel';
import { SumoPodAIDriver } from './drivers/sumopod';
import { OpenAICompatibleAIDriver } from './drivers/openai-compatible';

import prisma from '../db';
import { recordApiUsage } from '../api-key';
import { debitClientCreditUsage, estimateAIUsageCredit } from '../credits';

export async function getAIGateway(context: AIGatewayContext = {}): Promise<AIGateway> {
  // Always fetch latest config from DB, then apply provider-specific overrides.
  const [config, providerConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: "GLOBAL_CONFIG" } }),
    context.clientId
      ? prisma.client.findUnique({ where: { id: context.clientId } })
      : Promise.resolve(null),
  ]);

  const activeConfig = providerConfig?.aiProvider ? providerConfig : config;

  const providerName = activeConfig?.aiProvider || "vercel-ai-gateway";
  const baseURL = activeConfig?.aiGatewayUrl || "";
  const model = activeConfig?.aiModel || (providerName === "sumopod" ? process.env.SUMOPOD_MODEL : null) || "gpt-4o-mini";
  const maxTokens = activeConfig?.aiMaxTokens || 1500;
  const temperature = activeConfig?.aiTemperature ?? 0.7;

  let driver: AIGatewayDriver;

  if (providerName === "sumopod") {
    driver = new SumoPodAIDriver(
      process.env.SUMOPOD_API_KEY || "",
      baseURL || process.env.SUMOPOD_BASE_URL || "",
      model,
      maxTokens,
      temperature
    );
  } else if (providerName === "custom" || providerName === "openai") {
    driver = new OpenAICompatibleAIDriver(
      process.env.OPENAI_API_KEY || process.env.CUSTOM_AI_API_KEY || process.env.AI_GATEWAY_API_KEY || "",
      baseURL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model,
      maxTokens,
      temperature
    );
  } else {
    // Default to vercel-ai-gateway
    driver = new VercelAIDriver(
      process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || "",
      baseURL || "https://ai-gateway.vercel.sh/v1",
      model,
      maxTokens,
      temperature
    );
  }

  const piiRedactPatterns = providerConfig ? providerConfig.piiRedactPatterns : config?.piiRedactPatterns;
  const piiSafeContexts = providerConfig ? providerConfig.piiSafeContexts : config?.piiSafeContexts;

  return new AIGateway(driver, { ...context, aiProvider: providerName, aiModel: model }, piiRedactPatterns, piiSafeContexts);
}
