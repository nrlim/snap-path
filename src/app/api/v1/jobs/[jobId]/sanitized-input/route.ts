import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import {
  sanitizeClaimValidationInput,
  sanitizeArbitraryJson,
} from "@/lib/ai/sanitizer";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Allow both session-based (dashboard) and API key auth
  const auth = await authenticateApiRequest(request);
  let authenticatedClientId = auth.authenticated ? auth.clientId : null;
  if (!auth.authenticated) {
    const session = await getSession();
    if (!session) {
      return auth.response;
    }
    authenticatedClientId =
      typeof session.clientId === "string" ? session.clientId : null;
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

    // External clients may only read their own jobs
    if (authenticatedClientId && job.clientId !== authenticatedClientId) {
      return NextResponse.json(
        { error: "Unauthorized access to this job" },
        { status: 403 }
      );
    }

    // Apply the same sanitizer that the AI gateway uses for each job type
    let sanitizedPayload: any;
    if (job.jobType === "MAP_JSON") {
      // Fetch PII config from system config for arbitrary JSON sanitization
      const config = await prisma.systemConfig.findUnique({
        where: { id: "GLOBAL_CONFIG" },
        select: { piiRedactPatterns: true, piiSafeContexts: true },
      });
      sanitizedPayload = sanitizeArbitraryJson(
        job.inputPayload,
        config?.piiRedactPatterns ?? [],
        config?.piiSafeContexts ?? []
      );
    } else {
      // CLAIM_VALIDATION, PATHWAY_GEN, TARIFF_CHECK, DRUG_PRICE etc.
      sanitizedPayload = sanitizeClaimValidationInput(job.inputPayload);
    }

    return NextResponse.json({
      jobId: job.id,
      jobType: job.jobType,
      sanitizedInput: sanitizedPayload,
    });
  } catch (error) {
    console.error("Failed to fetch sanitized input:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
