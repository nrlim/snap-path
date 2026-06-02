"use server";

import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type MedicalItemSortField = "drug" | "maxPrice" | "avgPrice" | "fetchedAt" | "expiresAt" | "status";
type SortDirection = "asc" | "desc";

function buildSearchWhere(search?: string): Prisma.MedicalItemPriceCacheWhereInput | undefined {
  const query = search?.trim();
  if (!query) return undefined;
  const contains = { contains: query, mode: "insensitive" as const };
  return {
    OR: [
      { itemName: contains },
      { itemGenericName: contains },
      { itemTypeCode: contains },
      { itemTypeName: contains },
      { itemGroup: contains },
    ],
  };
}

function buildOrderBy(sortField: MedicalItemSortField = "fetchedAt", sortDirection: SortDirection = "desc"): Prisma.MedicalItemPriceCacheOrderByWithRelationInput[] {
  const direction: Prisma.SortOrder = sortDirection === "asc" ? "asc" : "desc";
  switch (sortField) {
    case "drug": return [{ itemName: direction }];
    case "maxPrice": return [{ marketPriceMax: direction }];
    case "avgPrice": return [{ marketPriceAvg: direction }];
    case "expiresAt": return [{ expiresAt: direction }];
    case "status": return [{ expiresAt: direction }];
    case "fetchedAt":
    default: return [{ fetchedAt: direction }];
  }
}

export async function getDrugPriceCacheEntries(params: { page?: number; limit?: number; search?: string; status?: string; sortField?: MedicalItemSortField; sortDirection?: SortDirection } = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
  const skip = (page - 1) * limit;
  const now = new Date();

  const where: Prisma.MedicalItemPriceCacheWhereInput = {
    ...(buildSearchWhere(params.search) || {}),
  };
  if (params.status === "active") where.expiresAt = { gt: now };
  if (params.status === "expired") where.expiresAt = { lte: now };

  const [entries, total, active, expired] = await Promise.all([
    prisma.medicalItemPriceCache.findMany({
      where,
      skip,
      take: limit,
      orderBy: [...buildOrderBy(params.sortField, params.sortDirection), { createdAt: "desc" }],
    }),
    prisma.medicalItemPriceCache.count({ where }),
    prisma.medicalItemPriceCache.count({ where: { expiresAt: { gt: now } } }),
    prisma.medicalItemPriceCache.count({ where: { expiresAt: { lte: now } } }),
  ]);

  return {
    entries,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    summary: { active, expired },
  };
}

export async function searchMedicalItemsForWizard(params: { search?: string; limit?: number } = {}) {
  const query = params.search?.trim();
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 30));
  const where = buildSearchWhere(query) || {};

  return prisma.medicalItemPriceCache.findMany({
    where: { ...where, expiresAt: { gt: new Date() } },
    take: limit,
    orderBy: [{ itemName: "asc" }, { createdAt: "desc" }],
  });
}
