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
      where: { id: jobId }
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (authenticatedClientId && job.clientId !== authenticatedClientId) {
      return NextResponse.json({ error: "Unauthorized access to this job" }, { status: 403 });
    }

    if (job.status !== "COMPLETED" && job.status !== "FAILED") {
      return NextResponse.json({ 
        error: "Job is not finished yet", 
        status: job.status 
      }, { status: 400 });
    }

    return NextResponse.json({
      jobId: job.id,
      jobType: job.jobType,
      status: job.status,
      result: job.outputResult,
      errorMessage: job.errorMessage,
      completedAt: job.completedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("Failed to fetch job result:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
