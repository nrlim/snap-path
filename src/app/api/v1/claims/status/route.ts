import { NextRequest, NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
import { getSession } from '@/lib/auth';
import { authenticateApiRequest } from '@/lib/middleware/auth-api';
import prisma from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/claims/status?runId=xxx&jobId=yyy
 *
 * Polls the Workflow SDK for run status, then cross-references with
 * the ClaimJob in the database to return the full result when completed.
 */
export async function GET(request: NextRequest) {
  // Authenticate (API key or dashboard session)
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) {
    const session = await getSession();
    if (!session) {
      return auth.response;
    }
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');
  const jobId = searchParams.get('jobId');

  if (!runId || !jobId) {
    return NextResponse.json(
      { status: 'not_found', error: 'runId and jobId parameters are required' },
      { status: 400 },
    );
  }

  try {
    const run = getRun(runId);
    const exists = await run.exists;

    if (!exists) {
      // Race condition safety: check if DB record is already completed
      const job = await prisma.claimJob.findUnique({
        where: { id: jobId },
        select: { id: true, status: true, outputResult: true },
      });

      if (job?.status === 'COMPLETED') {
        return NextResponse.json({ status: 'completed', jobId, result: job.outputResult });
      }

      return NextResponse.json(
        { status: 'not_found', error: 'Workflow run tidak ditemukan.' },
        { status: 404 },
      );
    }

    const wfStatus = await run.status;

    if (wfStatus === 'failed' || wfStatus === 'cancelled') {
      // Mark the job as failed in DB
      await prisma.claimJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      }).catch(() => {}); // Best-effort

      return NextResponse.json({ status: 'failed', error: 'Workflow gagal. Silakan coba lagi.' });
    }

    if (wfStatus === 'completed') {
      const job = await prisma.claimJob.findUnique({
        where: { id: jobId },
        select: { id: true, status: true, outputResult: true },
      });

      if (!job || job.status !== 'COMPLETED') {
        // Workflow completed but DB not yet committed — brief race condition, treat as running
        return NextResponse.json({ status: 'running' });
      }

      return NextResponse.json({ status: 'completed', jobId, result: job.outputResult });
    }

    // running / pending — return current DB job status for granular UI steps
    const job = await prisma.claimJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    return NextResponse.json({ status: 'running', jobStatus: job?.status ?? 'PROCESSING' });
  } catch (error) {
    console.error('[Claim Status API] error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { status: 'failed', error: 'Terjadi kesalahan internal. Silakan coba lagi.' },
      { status: 500 },
    );
  }
}
