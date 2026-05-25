import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { authenticateApiRequest } from '@/lib/middleware/auth-api';
import { recordApiUsage } from '@/lib/api-key';
import { getSession } from '@/lib/auth';
import prisma from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/rbac';
import { countTodayPathwayRequests, getPathwayLimitForRole, getPathwayLimitSettings, PATHWAY_LIMIT_WINDOW_LABEL } from '@/lib/pathway-limits';
import { claimValidationWorkflow } from '@/workflows/claim-validation';
import { resolveActualLosDays } from '@/lib/los';

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
    clientId = payload.clientId || clientId || null;
    providerId = payload.providerId || null;
    payload.clientId = clientId;
    payload.providerId = providerId;

    const actualLos = resolveActualLosDays(payload);
    if (actualLos > 0) {
      payload.extra = { ...(payload.extra || {}), los: String(actualLos) };
    }

    if (isDashboardUser && dashboardUser) {
      const settings = await getPathwayLimitSettings();
      const limit = getPathwayLimitForRole(settings, dashboardUser.role);
      const used = await countTodayPathwayRequests(dashboardUser.id);

      if (limit > 0 && used >= limit) {
        return NextResponse.json(
          {
            error: `Limit generate Clinical Pathway untuk role ${dashboardUser.role} sudah tercapai (${used}/${limit}) ${PATHWAY_LIMIT_WINDOW_LABEL}. Hubungi admin untuk menaikkan limit.`,
            code: 'PATHWAY_DAILY_LIMIT_REACHED',
            limit,
            used,
          },
          { status: 429 },
        );
      }

      payload.requestedByUserId = dashboardUser.id;
      payload.requestedByUserRole = dashboardUser.role;
    }

    // Create job record in DB first to get a stable jobId
    const claimJob = await prisma.claimJob.create({
      data: {
        jobType: 'CLAIM_VALIDATION',
        status: 'QUEUED',
        inputPayload: payload,
        clientId,
        providerId,
      },
    });

    // Fire-and-forget: start the workflow in background
    const run = await start(claimValidationWorkflow, [{ jobId: claimJob.id, payload }]);

    const response = NextResponse.json(
      {
        success: true,
        jobId: claimJob.id,
        runId: run.runId,
        message: 'Claim validation job telah dimulai.',
        statusUrl: `/api/v1/claims/status?runId=${run.runId}&jobId=${claimJob.id}`,
      },
      { status: 202 },
    );

    // Record API usage
    if (!isDashboardUser && auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        clientId,
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
    console.error('Failed to start claim validation workflow:', error);

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
