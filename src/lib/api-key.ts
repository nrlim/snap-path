import crypto from 'crypto';
import prisma from '@/lib/db';

const KEY_PREFIX = 'sp_';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const source = process.env.API_CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default_super_secure_secret_key_change_me_in_production';
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptCredential(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptCredential(cipherText: string | null | undefined): string | null {
  if (!cipherText) return null;

  try {
    const [ivValue, tagValue, encryptedValue] = cipherText.split('.');
    if (!ivValue || !tagValue || !encryptedValue) return null;

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    console.error('Failed to decrypt API credential:', error);
    return null;
  }
}

export function generateApiCredential(): { key: string; secret: string; keyHash: string; secretHash: string; keyCipher: string; secretCipher: string } {
  const key = `${KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
  const secret = `sps_${crypto.randomBytes(32).toString('hex')}`;

  return {
    key,
    secret,
    keyHash: hashApiKey(key),
    secretHash: hashApiKey(secret),
    keyCipher: encryptCredential(key),
    secretCipher: encryptCredential(secret),
  };
}

export function generateApiKey(): { key: string; hash: string } {
  const credential = generateApiCredential();
  return { key: credential.key, hash: credential.keyHash };
}

export function hashApiKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function validateApiKey(key: string | null, secret?: string | null) {
  if (!key || !key.startsWith(KEY_PREFIX)) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const hash = hashApiKey(key);
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { client: true },
  });

  if (!apiKeyRecord) {
    return { valid: false, error: 'API key not found' };
  }

  if (!apiKeyRecord.isActive) {
    return { valid: false, error: 'API key is inactive' };
  }

  if (apiKeyRecord.secretHash) {
    if (!secret) {
      return { valid: false, error: 'API secret is missing' };
    }

    const secretHash = hashApiKey(secret);
    if (secretHash !== apiKeyRecord.secretHash) {
      return { valid: false, error: 'Invalid API secret' };
    }
  }

  if (apiKeyRecord.client && !apiKeyRecord.client.isActive) {
    return { valid: false, error: 'Client is inactive' };
  }

  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return { valid: false, error: 'API key has expired' };
  }

  return { valid: true, apiKey: apiKeyRecord };
}

export async function recordApiUsage(params: {
  apiKeyId?: string | null;
  clientId?: string | null;
  providerId?: string | null;
  jobId?: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  requestType?: 'API' | 'AI';
  aiProvider?: string | null;
  aiModel?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
}) {
  try {
    const inputTokens = params.inputTokens || 0;
    const outputTokens = params.outputTokens || 0;

    await prisma.apiUsageLog.create({
      data: {
        apiKeyId: params.apiKeyId || null,
        clientId: params.clientId || null,
        providerId: params.providerId || null,
        jobId: params.jobId || null,
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        requestType: params.requestType || 'API',
        aiProvider: params.aiProvider || null,
        aiModel: params.aiModel || null,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: params.durationMs,
      },
    });
  } catch (error) {
    console.error('Failed to record API usage:', error);
    // Don't throw, we don't want to break the API response if logging fails
  }
}
