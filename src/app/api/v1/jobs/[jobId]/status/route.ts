import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { getSession } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  
  const auth = await authenticateApiRequest(request);
  let authenticatedClientId = auth.authenticated ? auth.clientId : null;
  if (!auth.authenticated) {
    const session = await getSession();
    if (!session) {
      return auth.response;
    }
    authenticatedClientId = typeof session.clientId === 'string' ? session.clientId : null;
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

    // Security check: external client credentials can only access their own jobs.
    if (authenticatedClientId && job.clientId !== authenticatedClientId) {
      return NextResponse.json({ error: "Unauthorized access to this job" }, { status: 403 });
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
    console.error("Failed to fetch job status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
