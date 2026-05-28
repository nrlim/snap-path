import { OpenAICompatibleAIDriver } from './openai-compatible';

const DEFAULT_SUMOPOD_BASE_URL = 'https://ai.sumopod.com/v1';
const DEFAULT_SUMOPOD_MODEL = 'gpt-4o-mini';

export class SumoPodAIDriver extends OpenAICompatibleAIDriver {
  constructor(apiKey?: string, baseURL?: string, model?: string, maxTokens?: number, temperature?: number) {
    super(
      apiKey || process.env.SUMOPOD_API_KEY || '',
      baseURL || process.env.SUMOPOD_BASE_URL || DEFAULT_SUMOPOD_BASE_URL,
      model || process.env.SUMOPOD_MODEL || DEFAULT_SUMOPOD_MODEL,
      maxTokens,
      temperature,
    );
  }
}
