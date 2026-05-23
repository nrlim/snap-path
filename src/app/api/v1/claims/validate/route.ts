import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { authenticateApiRequest } from '@/lib/middleware/auth-api';
import { recordApiUsage } from '@/lib/api-key';
import { getSession } from '@/lib/auth';
import prisma from '@/lib/db';
import { claimValidationWorkflow } from '@/workflows/claim-validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  let clientId = auth.clientId;
  let providerId: string | null | undefined = null;
  let isDashboardUser = false;

  if (!auth.authenticated) {
    const session = await getSession();
    if (!session) {
      return auth.response;
    }
    isDashboardUser = true;
    clientId = typeof session.clientId === 'string' ? session.clientId : null;
  }

  try {
    const payload = await request.json();
    clientId = payload.clientId || clientId || null;
    providerId = payload.providerId || null;
    payload.clientId = clientId;
    payload.providerId = providerId;

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
