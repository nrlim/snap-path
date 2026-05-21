export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIGatewayDriver {
  generateText(prompt: string, context?: AIMessage[]): Promise<string>;
  extractMedicalData(clinicalText: string): Promise<Record<string, unknown>>;
}

/**
 * AIGateway is a decoupled abstraction over specific AI models (Sumopod, Vercel AI SDK, 9router).
 * It ensures the business logic is agnostic to the underlying AI provider.
 */
export class AIGateway {
  private driver: AIGatewayDriver;

  constructor(driver: AIGatewayDriver) {
    this.driver = driver;
  }

  async summarizePathway(clinicalText: string): Promise<string> {
    return this.driver.generateText(
      "Ringkas teks rekam medis berikut menjadi pathway deterministik yang jelas.",
      [{ role: "user", content: clinicalText }]
    );
  }

  async extractEntities(clinicalText: string): Promise<Record<string, unknown>> {
    return this.driver.extractMedicalData(clinicalText);
  }
}
