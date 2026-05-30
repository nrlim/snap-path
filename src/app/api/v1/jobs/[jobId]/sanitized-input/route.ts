import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";
import {
  sanitizeClaimValidationInput,
  sanitizeArbitraryJson,
} from "@/lib/ai/sanitizer";

async function authorizeJobAccess(request: Request): Promise<
  | { authorized: true; clientId: string | null; isPlatformAdmin: boolean }
  | { authorized: false; response: NextResponse }
> {
  const auth = await authenticateApiRequest(request);
  if (auth.authenticated) {
    return { authorized: true, clientId: auth.clientId ?? null, isPlatformAdmin: false };
  }

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
        clientId: true,
        inputPayload: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Tenant isolation
    if (!authz.isPlatformAdmin && authz.clientId && job.clientId !== authz.clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!authz.isPlatformAdmin && !authz.clientId && job.clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Apply the same sanitizer that the AI gateway uses for each job type
    let sanitizedPayload: unknown;
    if (job.jobType === "MAP_JSON") {
      const [config, clientConfig] = await Promise.all([
        prisma.systemConfig.findUnique({
          where: { id: "GLOBAL_CONFIG" },
          select: { piiRedactPatterns: true, piiSafeContexts: true },
        }),
        job.clientId
          ? prisma.client.findUnique({
              where: { id: job.clientId },
              select: { piiRedactPatterns: true, piiSafeContexts: true },
            })
          : Promise.resolve(null),
      ]);
      sanitizedPayload = sanitizeArbitraryJson(
        job.inputPayload,
        clientConfig ? clientConfig.piiRedactPatterns : (config?.piiRedactPatterns ?? []),
        clientConfig ? clientConfig.piiSafeContexts : (config?.piiSafeContexts ?? [])
      );
    } else {
      sanitizedPayload = sanitizeClaimValidationInput(job.inputPayload);
    }

    return NextResponse.json({
      jobId: job.id,
      jobType: job.jobType,
      sanitizedInput: sanitizedPayload,
    });
  } catch (error) {
    console.error("[jobs/sanitized-input]", { jobId, message: error instanceof Error ? error.message : 'Unknown' });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
