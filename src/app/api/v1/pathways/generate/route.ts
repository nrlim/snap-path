import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { recordApiUsage } from "@/lib/api-key";
import prisma from "@/lib/db";
import { generateClinicalPathway } from "@/lib/ai/generators/pathway";

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const payload = await request.json();
    const claimJob = await prisma.claimJob.create({
      data: {
        jobType: "PATHWAY_GEN",
        status: "QUEUED",
        inputPayload: payload,
        providerId: payload.providerId || auth.providerId,
      }
    });

    // Run synchronously in background
    setTimeout(async () => {
      try {
        await prisma.claimJob.update({ where: { id: claimJob.id }, data: { status: "PROCESSING", startedAt: new Date() } });
        
        const result = await generateClinicalPathway(payload, claimJob.id);

        await prisma.claimJob.update({
          where: { id: claimJob.id },
          data: { status: "COMPLETED", outputResult: result as any, completedAt: new Date() }
        });
      } catch (err) {
        console.error("Local background workflow error:", err);
        await prisma.claimJob.update({ where: { id: claimJob.id }, data: { status: "FAILED" } });
      }
    }, 1000);

    await recordApiUsage({
      apiKeyId: auth.apiKeyId!,
      endpoint: "/api/v1/pathways/generate",
      method: "POST",
      statusCode: 202,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      jobId: claimJob.id,
      message: "Pathway generation job has been queued locally.",
      statusUrl: `/api/v1/jobs/${claimJob.id}/status`
    }, { status: 202 });

  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
