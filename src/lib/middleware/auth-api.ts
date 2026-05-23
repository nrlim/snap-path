import { NextResponse } from 'next/server';
import { validateApiKey } from '../api-key';

export async function authenticateApiRequest(request: Request) {
  // Check Authorization header for Bearer token
  const authHeader = request.headers.get('Authorization');
  let apiKey = null;
  let apiSecret = request.headers.get('x-api-secret');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  } else if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
    const [basicKey, basicSecret] = decoded.split(':');
    apiKey = basicKey;
    apiSecret = basicSecret || apiSecret;
  } else {
    // Alternatively, check x-api-key header
    apiKey = request.headers.get('x-api-key');
  }

  if (!apiKey) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Unauthorized. API key is missing. Provide it via x-api-key + x-api-secret headers or Authorization: Basic base64(key:secret).' },
        { status: 401 }
      )
    };
  }

  const { valid, error, apiKey: keyRecord } = await validateApiKey(apiKey, apiSecret);

  if (!valid || !keyRecord) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: `Unauthorized. ${error}` },
        { status: 401 }
      )
    };
  }

  return {
    authenticated: true,
    apiKeyId: keyRecord.id,
    clientId: keyRecord.clientId,
    providerId: null,
  };
}
