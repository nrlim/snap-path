import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { recordApiUsage } from "@/lib/api-key";
import prisma from "@/lib/db";
import { validateTariffPrice } from "@/lib/ai/validators/tariff";

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const payload = await request.json();
    const claimJob = await prisma.claimJob.create({
      data: {
        jobType: "TARIFF_CHECK",
        status: "QUEUED",
        inputPayload: payload,
        providerId: payload.providerId || auth.providerId,
      }
    });

    // Run synchronously in background
    setTimeout(async () => {
      try {
        await prisma.claimJob.update({ where: { id: claimJob.id }, data: { status: "PROCESSING", startedAt: new Date() } });
        
        const result = await validateTariffPrice(payload, claimJob.id);

        await prisma.claimJob.update({
          where: { id: claimJob.id },
          data: { status: "COMPLETED", outputResult: result as any, completedAt: new Date() }
        });
      } catch (err) {
        console.error("Local background workflow error:", err);
        await prisma.claimJob.update({ where: { id: claimJob.id }, data: { status: "FAILED" } });
      }
    }, 1000);

    if (auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        endpoint: "/api/v1/tariff/validate",
        method: "POST",
        statusCode: 202,
        durationMs: Date.now() - startTime
      });
    }

    return NextResponse.json({
      success: true,
      jobId: claimJob.id,
      message: "Tariff validation job has been queued locally.",
      statusUrl: `/api/v1/jobs/${claimJob.id}/status`
    }, { status: 202 });

  } catch (error) {
    console.error('[tariff/validate]', { message: error instanceof Error ? error.message : 'Unknown' });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
