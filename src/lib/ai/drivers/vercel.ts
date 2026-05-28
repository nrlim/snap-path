import { OpenAICompatibleAIDriver } from './openai-compatible';

const DEFAULT_VERCEL_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
const DEFAULT_VERCEL_MODEL = 'gpt-4o-mini';

export class VercelAIDriver extends OpenAICompatibleAIDriver {
  constructor(apiKey: string, baseURL?: string, model?: string, maxTokens?: number, temperature?: number) {
    super(
      apiKey,
      baseURL || DEFAULT_VERCEL_BASE_URL,
      model || DEFAULT_VERCEL_MODEL,
      maxTokens,
      temperature,
    );
  }
}
