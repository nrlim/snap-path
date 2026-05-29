import { NextRequest, NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
import { getSession } from '@/lib/auth';
import { authenticateApiRequest } from '@/lib/middleware/auth-api';
import prisma from '@/lib/db';
import { runClaimValidationInline } from '@/workflows/claim-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/claims/poll?runId=xxx&jobId=yyy
 *
 * Polls the Workflow SDK for run status, then cross-references with
 * the ClaimJob in the database to return the full result when completed.
 *
 * NOTE: This route was previously at /api/v1/claims/status but that path
 * conflicts with Next.js 16 Turbopack's internal [__metadata_id__] segment
 * resolution, causing ENOENT errors at dev startup.
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

    const latestJob = await prisma.claimJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, outputResult: true, errorMessage: true },
    });

    // DB completion is the source of truth for UI navigation. In dev/recovery cases
    // the ClaimJob can be completed even while the Workflow SDK run is still pending.
    if (latestJob?.status === 'COMPLETED') {
      return NextResponse.json({ status: 'completed', jobId, result: latestJob.outputResult });
    }
    if (latestJob?.status === 'FAILED') {
      return NextResponse.json({ status: 'failed', error: latestJob.errorMessage || 'Workflow gagal. Silakan coba lagi.' });
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
        return NextResponse.json({ status: 'running', jobStatus: job?.status ?? 'AGGREGATE' });
      }

      return NextResponse.json({ status: 'completed', jobId, result: job.outputResult });
    }

    // running / pending — return current DB job status for granular UI steps
    const job = await prisma.claimJob.findUnique({
      where: { id: jobId },
      select: { status: true, inputPayload: true, providerId: true, clientId: true, updatedAt: true },
    });

    const statusAgeMs = job ? Date.now() - job.updatedAt.getTime() : 0;

    // Local dev recovery: if Workflow SDK has a run but no step has advanced the DB
    // status for a while, execute the same steps inline so the UI does not stay on
    // Inisialisasi forever during demos.
    const isPotentiallyStalled = job && ['QUEUED', 'INIT'].includes(job.status) && statusAgeMs > 10_000;
    const canInlineRecover = process.env.NODE_ENV !== 'production' || process.env.WORKFLOW_INLINE_FALLBACK === 'true';
    if (isPotentiallyStalled && canInlineRecover) {
      await prisma.claimJob.update({ where: { id: jobId }, data: { status: 'DOC_VAL' } }).catch(() => {});
      void runClaimValidationInline({
        jobId,
        payload: {
          ...(job.inputPayload as Record<string, unknown>),
          clientId: job.clientId,
          providerId: job.providerId,
        },
      }).catch(async (error) => {
        console.error('[claims/poll] inline workflow recovery failed', { jobId, message: error instanceof Error ? error.message : 'Unknown' });
        await prisma.claimJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', errorMessage: 'Inline workflow recovery failed.', completedAt: new Date() },
        }).catch(() => {});
      });
    }

    return NextResponse.json({ status: 'running', jobStatus: job?.status ?? 'PROCESSING' });
  } catch (error) {
    console.error('[Claim Poll API] error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { status: 'failed', error: 'Terjadi kesalahan internal. Silakan coba lagi.' },
      { status: 500 },
    );
  }
}
