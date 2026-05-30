import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { authenticateApiRequest } from '@/lib/middleware/auth-api';
import { recordApiUsage } from '@/lib/api-key';
import { getSession } from '@/lib/auth';
import prisma from '@/lib/db';
import { getAuthenticatedUser, isPlatformAdminRole } from '@/lib/rbac';
import { claimValidationWorkflow } from '@/workflows/claim-validation';
import { resolveActualLosDays } from '@/lib/los';
import { sanitizeClaimValidationInput } from '@/lib/ai/sanitizer';
import { buildClaimDisplayMetadata } from '@/lib/claim-display';
import { assertClientHasCredit } from '@/lib/credits';
import type { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  let clientId = auth.clientId;
  let providerId: string | null | undefined = null;
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
    const payload = await request.json();
    const payloadClientId = typeof payload.clientId === 'string' && payload.clientId.trim() ? payload.clientId.trim() : null;
    const isPlatformDashboardUser = isDashboardUser && isPlatformAdminRole(dashboardUser?.role);

    // Security: never trust clientId from request body for client-scoped users or API keys.
    // API keys are bound to a client, and dashboard client users are bound to their assigned client.
    clientId = isPlatformDashboardUser ? payloadClientId : (clientId || null);
    providerId = typeof payload.providerId === 'string' && payload.providerId.trim() ? payload.providerId.trim() : null;

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client wajib dipilih agar credit usage dapat dicatat.', code: 'CLIENT_REQUIRED' },
        { status: 400 },
      );
    }

    const resolvedClientId = clientId;

    const [client, provider] = await Promise.all([
      prisma.client.findUnique({ where: { id: resolvedClientId }, select: { id: true, isActive: true } }),
      providerId ? prisma.provider.findUnique({ where: { id: providerId }, select: { id: true, clientId: true, isActive: true } }) : Promise.resolve(null),
    ]);

    if (!client?.isActive) {
      return NextResponse.json(
        { error: 'Client tidak aktif atau tidak ditemukan.', code: 'CLIENT_INACTIVE' },
        { status: 403 },
      );
    }

    if (providerId && (!provider?.isActive || provider.clientId !== resolvedClientId)) {
      return NextResponse.json(
        { error: 'Provider tidak valid untuk client ini.', code: 'PROVIDER_CLIENT_MISMATCH' },
        { status: 403 },
      );
    }

    payload.clientId = resolvedClientId;
    payload.providerId = providerId;

    const actualLos = resolveActualLosDays(payload);
    if (actualLos > 0) {
      payload.extra = { ...(payload.extra || {}), los: String(actualLos) };
    }

    if (isDashboardUser && dashboardUser) {
      payload.requestedByUserId = dashboardUser.id;
      payload.requestedByUserRole = dashboardUser.role;
    }

    const creditPreflight = await assertClientHasCredit(resolvedClientId);
    if (!creditPreflight.success) {
      return NextResponse.json(
        {
          error: 'Credit client tidak mencukupi. Silakan hubungi admin untuk top up credit.',
          code: 'CLIENT_CREDIT_INSUFFICIENT',
        },
        { status: 402 },
      );
    }

    // Sanitize PII before persisting to the main payload used by AI/audit views.
    // A minimal encrypted display snapshot is stored separately for authorized dashboard UI labels.
    const sanitizedPayload = sanitizeClaimValidationInput(payload);
    const uiDisplayCipher = buildClaimDisplayMetadata(payload);

    const claimJob = await prisma.claimJob.create({
      data: {
        jobType: 'CLAIM_VALIDATION',
        status: 'QUEUED',
        inputPayload: sanitizedPayload as Prisma.InputJsonValue,
        clientId: resolvedClientId,
        providerId,
        metadata: uiDisplayCipher ? { uiDisplayCipher } : undefined,
      },
    });

    // Fire-and-forget: start the durable workflow in background.
    const run = await start(claimValidationWorkflow, [{ jobId: claimJob.id, payload }]);

    await prisma.claimJob.update({
      where: { id: claimJob.id },
      data: { workflowRunId: run.runId },
    });

    const response = NextResponse.json(
      {
        success: true,
        jobId: claimJob.id,
        runId: run.runId,
        message: 'Claim validation job telah dimulai.',
        statusUrl: `/api/v1/claims/poll?runId=${run.runId}&jobId=${claimJob.id}`,
      },
      { status: 202 },
    );

    if (!isDashboardUser && auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        clientId: resolvedClientId,
        providerId,
        jobId: claimJob.id,
        endpoint: '/api/v1/claims/validate',
        method: 'POST',
        statusCode: 202,
        durationMs: Date.now() - startTime,
      });
    }

    return response;
  } catch (error) {
    console.error('[claims/validate]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      clientId,
    });

    if (!isDashboardUser && auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        clientId,
        providerId,
        endpoint: '/api/v1/claims/validate',
        method: 'POST',
        statusCode: 500,
        durationMs: Date.now() - startTime,
      });
    }

    return NextResponse.json(
      { error: 'Internal server error while starting workflow.' },
      { status: 500 },
    );
  }
}
