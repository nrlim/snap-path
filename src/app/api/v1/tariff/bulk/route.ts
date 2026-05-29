import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/middleware/auth-api";
import { recordApiUsage } from "@/lib/api-key";
import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type TariffBulkEntry = {
  providerId: string;
  procedureCode: string;
  procedureName: string;
  category: string;
  subcategory?: string | null;
  serviceCode?: string | null;
  unit?: string | null;
  regionCode?: string | null;
  basePrice: number;
  maxPrice: number;
  priceTiersJson?: Prisma.InputJsonValue;
  currency?: string;
  notes?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive?: boolean;
};

function isTariffBulkEntry(entry: unknown): entry is TariffBulkEntry {
  if (!entry || typeof entry !== "object") return false;
  const value = entry as Record<string, unknown>;

  return (
    typeof value.providerId === "string" &&
    typeof value.procedureCode === "string" &&
    typeof value.procedureName === "string" &&
    typeof value.category === "string" &&
    typeof value.basePrice === "number" &&
    typeof value.maxPrice === "number" &&
    typeof value.effectiveFrom === "string" &&
    !Number.isNaN(Date.parse(value.effectiveFrom)) &&
    (value.effectiveTo == null || (typeof value.effectiveTo === "string" && !Number.isNaN(Date.parse(value.effectiveTo))))
  );
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const payload = (await request.json()) as { entries?: unknown };

    if (!payload.entries || !Array.isArray(payload.entries)) {
      return NextResponse.json({ error: "Invalid payload: 'entries' must be an array" }, { status: 400 });
    }

    // Limit batch size to prevent overwhelming the database or request limits
    if (payload.entries.length > 500) {
      return NextResponse.json({ error: "Maximum 500 entries per bulk request allowed" }, { status: 400 });
    }

    const validEntries = payload.entries.filter(isTariffBulkEntry);

    if (validEntries.length === 0) {
      return NextResponse.json({ error: "No valid entries provided in bulk payload." }, { status: 400 });
    }

    const dataToInsert: Prisma.TariffEntryCreateManyInput[] = validEntries.map((entry) => ({
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
      priceTiersJson: entry.priceTiersJson,
      currency: entry.currency || "IDR",
      notes: entry.notes || null,
      effectiveFrom: new Date(entry.effectiveFrom),
      effectiveTo: entry.effectiveTo ? new Date(entry.effectiveTo) : null,
      isActive: entry.isActive ?? true,
    }));

    const result = await prisma.tariffEntry.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    if (auth.apiKeyId) {
      await recordApiUsage({
        apiKeyId: auth.apiKeyId,
        endpoint: "/api/v1/tariff/bulk",
        method: "POST",
        statusCode: 201,
        durationMs: Date.now() - startTime
      });
    }

    return NextResponse.json({
      success: true,
      message: `Successfully inserted ${result.count} tariff entries.`,
      count: result.count
    }, { status: 201 });

  } catch (error) {
    console.error("[tariff/bulk] error:", { message: error instanceof Error ? error.message : "Unknown" });
    return NextResponse.json({ error: "Internal server error during bulk import" }, { status: 500 });
  }
}
