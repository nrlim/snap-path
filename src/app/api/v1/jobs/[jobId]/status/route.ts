import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { getSession } from "@/lib/auth";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";

/**
 * Verifies that the authenticated user/client has access to a specific job.
 * Platform admins can access any job. Client-bound users can only access their own.
 * Unauthenticated requests are rejected.
 */
async function authorizeJobAccess(request: Request): Promise<
  | { authorized: true; clientId: string | null; isPlatformAdmin: boolean }
  | { authorized: false; response: NextResponse }
> {
  const auth = await authenticateApiRequest(request);
  if (auth.authenticated) {
    return { authorized: true, clientId: auth.clientId ?? null, isPlatformAdmin: false };
  }

  // Fall back to session auth
  const session = await getSession();
  if (!session || typeof session.sub !== 'string') {
    return { authorized: false, response: auth.response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return { authorized: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { authorized: true, clientId: user.clientId, isPlatformAdmin: isPlatformAdminRole(user.role) };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const authz = await authorizeJobAccess(request);
  if (!authz.authorized) return authz.response;

  // Validate jobId format (UUID)
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  try {
    const job = await prisma.claimJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobType: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        clientId: true,
        providerId: true,
      }
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Tenant isolation: non-admin clients can only access their own jobs
    if (!authz.isPlatformAdmin && authz.clientId && job.clientId !== authz.clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Non-admin viewers without a clientId cannot view client-specific jobs
    if (!authz.isPlatformAdmin && !authz.clientId && job.clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      jobId: job.id,
      jobType: job.jobType,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      errorMessage: job.errorMessage,
    });
  } catch (error) {
    console.error("[jobs/status]", { jobId, message: error instanceof Error ? error.message : 'Unknown' });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
