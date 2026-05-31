import { NextRequest, NextResponse } from 'next/server';
import { getAIGateway } from '@/lib/ai/gateway';
import { authenticateApiRequest } from '@/lib/middleware/auth-api';
import { getSession } from '@/lib/auth';
import { getAuthenticatedUser, isPlatformAdminRole } from '@/lib/rbac';
import { recordApiUsage } from '@/lib/api-key';
import { assertClientHasRequestQuota, debitClientRequestUsage } from '@/lib/credits';
import prisma from '@/lib/db';

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
    const bodyClientId = typeof body.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : null;
    const resolvedClientId = isDashboardUser && isPlatformAdminRole(dashboardUser?.role) ? bodyClientId : (clientId || null);

    if (!resolvedClientId) {
      return NextResponse.json(
        { error: 'Client wajib dipilih agar penggunaan request dapat dicatat.', code: 'CLIENT_REQUIRED' },
        { status: 400 },
      );
    }

    if (providerId) {
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: { clientId: true, isActive: true },
      });
      if (!provider?.isActive || provider.clientId !== resolvedClientId) {
        return NextResponse.json(
          { error: 'Provider tidak valid untuk client ini.', code: 'PROVIDER_CLIENT_MISMATCH' },
          { status: 403 },
        );
      }
    }

    const requestPreflight = await assertClientHasRequestQuota(resolvedClientId);

    if (!requestPreflight.success) {
      return NextResponse.json(
        { error: 'Kuota request client tidak mencukupi. Silakan hubungi admin untuk top up request.', code: 'CLIENT_REQUEST_QUOTA_INSUFFICIENT' },
        { status: 402 },
      );
    }

    const requestDebit = await debitClientRequestUsage({
      clientId: resolvedClientId,
      description: 'AI JSON mapping request',
    });

    if (!requestDebit.success) {
      return NextResponse.json(
        { error: 'Kuota request client tidak mencukupi. Silakan hubungi admin untuk top up request.', code: 'CLIENT_REQUEST_QUOTA_INSUFFICIENT' },
        { status: 402 },
      );
    }

    const gateway = await getAIGateway({
      clientId: resolvedClientId,
      providerId: providerId,
    });
    const { data, usage } = await gateway.mapArbitraryJsonToClaim(body);

    if (!isDashboardUser && auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        clientId: resolvedClientId,
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
  } catch (err) {
    console.error('[claims/map-json]', {
      message: err instanceof Error ? err.message : 'Unknown error',
      clientId,
    });

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
      { error: 'AI mapping failed due to an internal server error.' },
      { status: 500 }
    );
  }
}
