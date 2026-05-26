import { NextRequest, NextResponse } from 'next/server';
import { getAIGateway } from '@/lib/ai/gateway';
import { authenticateApiRequest } from '@/lib/middleware/auth-api';
import { getSession } from '@/lib/auth';
import { getAuthenticatedUser } from '@/lib/rbac';
import { recordApiUsage } from '@/lib/api-key';

/**
 * POST /api/v1/claims/map-json
 * Receives an arbitrary JSON object from any hospital system (SIMRS, FHIR, HL7, custom export)
 * and uses AI to intelligently map it to SnapPath's ClaimValidationInput schema.
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(req);
  let clientId = auth.clientId;
  let isDashboardUser = false;
  let dashboardUser: Awaited<ReturnType<typeof getAuthenticatedUser>> = null;

  if (!auth.authenticated) {
    const session = await getSession();
    if (!session) {
      return auth.response;
    }
    dashboardUser = await getAuthenticatedUser();
    if (!dashboardUser) {
      return auth.response;
    }
    isDashboardUser = true;
    clientId = dashboardUser.clientId;
  }

  try {
    const body = await req.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a valid JSON object.' },
        { status: 400 }
      );
    }

    const providerId = typeof body.providerId === 'string' ? body.providerId : null;
    const gateway = await getAIGateway({
      clientId: typeof body.clientId === 'string' ? body.clientId : clientId,
      providerId: providerId,
    });
    const { data, usage } = await gateway.mapArbitraryJsonToClaim(body);

    if (!isDashboardUser && auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        clientId: typeof body.clientId === 'string' ? body.clientId : clientId,
        providerId: providerId,
        endpoint: '/api/v1/claims/map-json',
        method: 'POST',
        statusCode: 200,
        requestType: 'AI',
        inputTokens: usage?.promptTokens,
        outputTokens: usage?.completionTokens,
        durationMs: Date.now() - startTime,
      });
    }

    return NextResponse.json({
      success: true,
      mapped: data,
      _mappingNotes: data._mappingNotes,
      usage,
    });
  } catch (err: any) {
    console.error('[map-json] Error:', err);

    if (!isDashboardUser && auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        clientId: clientId,
        endpoint: '/api/v1/claims/map-json',
        method: 'POST',
        statusCode: 500,
        durationMs: Date.now() - startTime,
      });
    }

    return NextResponse.json(
      { error: 'AI mapping failed due to an internal server error. Please check server logs.' },
      { status: 500 }
    );
  }
}
