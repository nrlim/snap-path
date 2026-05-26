import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { recordApiUsage } from "@/lib/api-key";
import prisma from "@/lib/db";

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const payload = await request.json();
    
    if (!payload.entries || !Array.isArray(payload.entries)) {
      return NextResponse.json({ error: "Invalid payload: 'entries' must be an array" }, { status: 400 });
    }

    // Limit batch size to prevent overwhelming the database or request limits
    if (payload.entries.length > 500) {
      return NextResponse.json({ error: "Maximum 500 entries per bulk request allowed" }, { status: 400 });
    }

    const validEntries = payload.entries.filter((entry: any) => 
      entry &&
      typeof entry.providerId === 'string' &&
      typeof entry.procedureCode === 'string' &&
      typeof entry.procedureName === 'string' &&
      typeof entry.category === 'string' &&
      typeof entry.basePrice === 'number' &&
      typeof entry.maxPrice === 'number' &&
      entry.effectiveFrom
    );

    if (validEntries.length === 0) {
      return NextResponse.json({ error: "No valid entries provided in bulk payload." }, { status: 400 });
    }

    const dataToInsert = validEntries.map((entry: any) => ({
      providerId: entry.providerId,
      procedureCode: entry.procedureCode,
      procedureName: entry.procedureName,
      category: entry.category,
      subcategory: entry.subcategory || null,
      serviceCode: entry.serviceCode || null,
      unit: entry.unit || null,
      regionCode: entry.regionCode || null,
      basePrice: entry.basePrice,
      maxPrice: entry.maxPrice,
      priceTiersJson: entry.priceTiersJson || undefined,
      currency: entry.currency || "IDR",
      notes: entry.notes || null,
      effectiveFrom: new Date(entry.effectiveFrom),
      effectiveTo: entry.effectiveTo ? new Date(entry.effectiveTo) : null,
      isActive: entry.isActive ?? true,
    }));

    const result = await prisma.tariffEntry.createMany({
      data: dataToInsert,
      skipDuplicates: true, // Prevents failure if some entries already exist (needs unique constraint, but we'll use it as standard)
    });

    await recordApiUsage({
      apiKeyId: auth.apiKeyId!,
      endpoint: "/api/v1/tariff/bulk",
      method: "POST",
      statusCode: 201,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      message: `Successfully inserted ${result.count} tariff entries.`,
      count: result.count
    }, { status: 201 });

  } catch (error) {
    console.error("Failed to bulk create tariff entries:", error);
    return NextResponse.json({ error: "Internal server error during bulk import" }, { status: 500 });
  }
}
