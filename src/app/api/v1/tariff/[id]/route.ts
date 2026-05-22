import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { recordApiUsage } from "@/lib/api-key";
import prisma from "@/lib/db";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const payload = await request.json();

    const updatedEntry = await prisma.tariffEntry.update({
      where: { id: params.id },
      data: {
        providerId: payload.providerId,
        procedureCode: payload.procedureCode,
        procedureName: payload.procedureName,
        category: payload.category,
        regionCode: payload.regionCode,
        basePrice: payload.basePrice,
        maxPrice: payload.maxPrice,
        currency: payload.currency,
        effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : undefined,
        effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
        isActive: payload.isActive,
      }
    });

    await recordApiUsage({
      apiKeyId: auth.apiKeyId!,
      endpoint: `/api/v1/tariff/[id]`,
      method: "PUT",
      statusCode: 200,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      data: updatedEntry
    });
  } catch (error: any) {
    console.error("Failed to update tariff entry:", error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: "Tariff entry not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    // Soft delete
    const deletedEntry = await prisma.tariffEntry.update({
      where: { id: params.id },
      data: { isActive: false }
    });

    await recordApiUsage({
      apiKeyId: auth.apiKeyId!,
      endpoint: `/api/v1/tariff/[id]`,
      method: "DELETE",
      statusCode: 200,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      message: "Tariff entry soft deleted successfully",
      data: deletedEntry
    });
  } catch (error: any) {
    console.error("Failed to delete tariff entry:", error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: "Tariff entry not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
