export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface AIGatewayDriver {
  generateText(prompt: string, context?: AIMessage[]): Promise<{ text: string; usage?: Usage }>;
  extractMedicalData(clinicalText: string): Promise<{ data: Record<string, unknown>; usage?: Usage }>;
  
  validateDiagnosisTreatment(payload: any): Promise<{ data: any; usage?: Usage }>;
  searchDrugMarketPrice(drugName: string): Promise<{ data: any; usage?: Usage }>;
  generateClinicalPathway(diagnosisCode: string, diagnosisName: string): Promise<{ data: any; usage?: Usage }>;
  validateDocumentCompleteness(payload: any): Promise<{ data: any; usage?: Usage }>;
  mapArbitraryJsonToClaim(rawJson: any): Promise<{ data: any; usage?: Usage }>;
}

/**
 * AIGateway is a decoupled abstraction over specific AI models (Sumopod, Vercel AI SDK, etc.).
 * It ensures the business logic is agnostic to the underlying AI provider.
 */
export class AIGateway {
  private driver: AIGatewayDriver;

  constructor(driver: AIGatewayDriver) {
    this.driver = driver;
  }

  async summarizePathway(clinicalText: string) {
    return this.driver.generateText(
      "Ringkas teks rekam medis berikut menjadi pathway deterministik yang jelas.",
      [{ role: "user", content: clinicalText }]
    );
  }

  async extractEntities(clinicalText: string) {
    return this.driver.extractMedicalData(clinicalText);
  }

  async validateDiagnosisTreatment(payload: any) {
    return this.driver.validateDiagnosisTreatment(payload);
  }

  async searchDrugMarketPrice(drugName: string) {
    return this.driver.searchDrugMarketPrice(drugName);
  }

  async generateClinicalPathway(diagnosisCode: string, diagnosisName: string) {
    return this.driver.generateClinicalPathway(diagnosisCode, diagnosisName);
  }

  async validateDocumentCompleteness(payload: any) {
    return this.driver.validateDocumentCompleteness(payload);
  }

  async mapArbitraryJsonToClaim(rawJson: any) {
    return this.driver.mapArbitraryJsonToClaim(rawJson);
  }
}

// Singleton helper to get default configured gateway
import { OpenAIDriver } from './drivers/openai';

import prisma from '../db';

export async function getAIGateway(): Promise<AIGateway> {
  // Always fetch latest config from DB
  const config = await prisma.systemConfig.findUnique({
    where: { id: "GLOBAL_CONFIG" }
  });

  const providerName = config?.aiProvider || "sumopod";
  let apiKey = "";
  let baseURL = config?.aiGatewayUrl || "";

  if (providerName === "sumopod") {
    apiKey = process.env.SUMOPOD_API_KEY || process.env.AI_GATEWAY_API_KEY || "";
    if (!baseURL) baseURL = "https://api.sumopod.com/v1";
  } else if (providerName === "vercel-ai-sdk") {
    apiKey = process.env.VERCEL_API_KEY || process.env.OPENAI_API_KEY || "";
    if (!baseURL) baseURL = "https://ai-gateway.vercel.sh/v1";
  } else {
    // Custom / Default
    apiKey = process.env.OPENAI_API_KEY || process.env.VERCEL_API_KEY || "";
    if (!baseURL) baseURL = "https://api.openai.com/v1"; // Custom can fallback to standard OpenAI
  }
  const model = config?.aiModel || "gpt-4o-mini";
  const maxTokens = config?.aiMaxTokens || 1500;
  const temperature = config?.aiTemperature ?? 0.7;
  
  const driver = new OpenAIDriver(apiKey, baseURL, model, maxTokens, temperature);
  return new AIGateway(driver);
}
