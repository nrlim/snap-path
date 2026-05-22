import { NextResponse } from 'next/server';
import { validateApiKey } from '../api-key';

export async function authenticateApiRequest(request: Request) {
  // Check Authorization header for Bearer token
  const authHeader = request.headers.get('Authorization');
  let apiKey = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  } else {
    // Alternatively, check x-api-key header
    apiKey = request.headers.get('x-api-key');
  }

  if (!apiKey) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Unauthorized. API key is missing. Provide it via Authorization: Bearer <key> or x-api-key header.' },
        { status: 401 }
      )
    };
  }

  const { valid, error, apiKey: keyRecord } = await validateApiKey(apiKey);

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
    providerId: keyRecord.providerId,
  };
}
