export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

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
  searchDrugMarketPrice(drug: string | { name: string; genericName?: string | null; dosage?: string | null }): Promise<{ data: any; usage?: Usage }>;
  generateClinicalPathway(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }>;
  validateDocumentCompleteness(payload: any): Promise<{ data: any; usage?: Usage }>;
  mapArbitraryJsonToClaim(rawJson: any): Promise<{ data: any; usage?: Usage }>;
  estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }>;
}

/**
 * AIGateway is a decoupled abstraction over specific AI models (Vercel AI SDK, Custom Gateway, etc.).
 * It ensures the business logic is agnostic to the underlying AI provider.
 */
export class AIGateway {
  private driver: AIGatewayDriver;
  private context: AIGatewayContext;

  constructor(driver: AIGatewayDriver, context: AIGatewayContext = {}) {
    this.driver = driver;
    this.context = context;
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
    }
  }

  async summarizePathway(clinicalText: string) {
    return this.track('summarizePathway', () => this.driver.generateText(
      "Ringkas teks rekam medis berikut menjadi pathway deterministik yang jelas.",
      [{ role: "user", content: clinicalText }]
    ));
  }

  async extractEntities(clinicalText: string) {
    return this.track('extractMedicalData', () => this.driver.extractMedicalData(clinicalText));
  }

  async validateDiagnosisTreatment(payload: any) {
    return this.track('validateDiagnosisTreatment', () => this.driver.validateDiagnosisTreatment(payload));
  }

  async searchDrugMarketPrice(drug: string | { name: string; genericName?: string | null; dosage?: string | null }) {
    return this.track('searchDrugMarketPrice', () => this.driver.searchDrugMarketPrice(drug));
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string) {
    return this.track('generateClinicalPathway', () => this.driver.generateClinicalPathway(diagnosisCode, diagnosisName));
  }

  async validateDocumentCompleteness(payload: any) {
    return this.track('validateDocumentCompleteness', () => this.driver.validateDocumentCompleteness(payload));
  }

  async mapArbitraryJsonToClaim(rawJson: any) {
    return this.track('mapArbitraryJsonToClaim', () => this.driver.mapArbitraryJsonToClaim(rawJson));
  }

  async estimateDiagnosisLos(diagnosisCode: string, diagnosisName: string) {
    return this.track('estimateDiagnosisLos', () => this.driver.estimateDiagnosisLos(diagnosisCode, diagnosisName));
  }
}

// Singleton helper to get default configured gateway
import { VercelAIDriver } from './drivers/vercel';

import prisma from '../db';
import { recordApiUsage } from '../api-key';

export async function getAIGateway(context: AIGatewayContext = {}): Promise<AIGateway> {
  // Always fetch latest config from DB, then apply provider-specific overrides.
  const [config, providerConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: "GLOBAL_CONFIG" } }),
    context.clientId
      ? prisma.client.findUnique({ where: { id: context.clientId } })
      : Promise.resolve(null),
  ]);

  const providerName = providerConfig?.aiProvider || config?.aiProvider || "vercel-ai-gateway";
  let apiKey = process.env.AI_GATEWAY_API_KEY || "";
  let baseURL = providerConfig?.aiGatewayUrl || config?.aiGatewayUrl || "";

  if (providerName === "vercel-ai-gateway") {
    if (!baseURL) baseURL = "https://ai-gateway.vercel.sh/v1";
  }
  const model = providerConfig?.aiModel || config?.aiModel || "gpt-4o-mini";
  const maxTokens = providerConfig?.aiMaxTokens || config?.aiMaxTokens || 1500;
  const temperature = providerConfig?.aiTemperature ?? config?.aiTemperature ?? 0.7;
  
  const driver = new VercelAIDriver(apiKey, baseURL, model, maxTokens, temperature);
  return new AIGateway(driver, { ...context, aiProvider: providerName, aiModel: model });
}
