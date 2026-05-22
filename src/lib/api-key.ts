import crypto from 'crypto';
import prisma from '@/lib/db';

const KEY_PREFIX = 'sp_';

export function generateApiKey(): { key: string; hash: string } {
  // Generate a cryptographically secure random string (32 bytes = 64 hex chars)
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const key = `${KEY_PREFIX}${randomBytes}`;
  
  // Hash the key using SHA-256 for storage
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  
  return { key, hash };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function validateApiKey(key: string | null) {
  if (!key || !key.startsWith(KEY_PREFIX)) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const hash = hashApiKey(key);
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { provider: true },
  });

  if (!apiKeyRecord) {
    return { valid: false, error: 'API key not found' };
  }

  if (!apiKeyRecord.isActive) {
    return { valid: false, error: 'API key is inactive' };
  }

  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return { valid: false, error: 'API key has expired' };
  }

  return { valid: true, apiKey: apiKeyRecord };
}

export async function recordApiUsage(params: {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
}) {
  try {
    await prisma.apiUsageLog.create({
      data: {
        apiKeyId: params.apiKeyId,
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        inputTokens: params.inputTokens || 0,
        outputTokens: params.outputTokens || 0,
        durationMs: params.durationMs,
      },
    });
  } catch (error) {
    console.error('Failed to record API usage:', error);
    // Don't throw, we don't want to break the API response if logging fails
  }
}
