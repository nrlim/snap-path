import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { recordApiUsage } from "@/lib/api-key";
import prisma from "@/lib/db";

export async function GET(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("providerId");
    const category = searchParams.get("category");
    const isActive = searchParams.get("isActive");
    
    // Server-side pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (providerId) whereClause.providerId = providerId;
    if (category) whereClause.category = category;
    if (isActive !== null) whereClause.isActive = isActive === "true";

    const [entries, total] = await Promise.all([
      prisma.tariffEntry.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.tariffEntry.count({ where: whereClause })
    ]);

    await recordApiUsage({
      apiKeyId: auth.apiKeyId!,
      endpoint: "/api/v1/tariff",
      method: "GET",
      statusCode: 200,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Failed to fetch tariff entries:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const payload = await request.json();

    const newEntry = await prisma.tariffEntry.create({
      data: {
        providerId: payload.providerId,
        procedureCode: payload.procedureCode,
        procedureName: payload.procedureName,
        category: payload.category,
        subcategory: payload.subcategory || null,
        serviceCode: payload.serviceCode || null,
        unit: payload.unit || null,
        regionCode: payload.regionCode || null,
        basePrice: payload.basePrice,
        maxPrice: payload.maxPrice,
        priceTiersJson: payload.priceTiersJson || undefined,
        currency: payload.currency || "IDR",
        notes: payload.notes || null,
        effectiveFrom: new Date(payload.effectiveFrom),
        effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
        isActive: payload.isActive ?? true,
      }
    });

    await recordApiUsage({
      apiKeyId: auth.apiKeyId!,
      endpoint: "/api/v1/tariff",
      method: "POST",
      statusCode: 201,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      data: newEntry
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to create tariff entry:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
