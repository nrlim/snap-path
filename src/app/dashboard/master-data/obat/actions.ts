"use server";

import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type MedicalItemSortField = "drug" | "maxPrice" | "avgPrice" | "fetchedAt" | "expiresAt" | "status";
type SortDirection = "asc" | "desc";

function buildSearchWhere(search?: string): Prisma.MedicalItemPriceMasterWhereInput | undefined {
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

function buildOrderBy(sortField: MedicalItemSortField = "fetchedAt", sortDirection: SortDirection = "desc"): Prisma.MedicalItemPriceMasterOrderByWithRelationInput[] {
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

export async function getMedicalItemMasterEntries(params: { page?: number; limit?: number; search?: string; status?: string; sortField?: MedicalItemSortField; sortDirection?: SortDirection } = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
  const skip = (page - 1) * limit;
  const now = new Date();

  const where: Prisma.MedicalItemPriceMasterWhereInput = {
    ...(buildSearchWhere(params.search) || {}),
  };
  if (params.status === "active") where.expiresAt = { gt: now };
  if (params.status === "expired") where.expiresAt = { lte: now };

  const [entries, total, active, expired] = await Promise.all([
    prisma.medicalItemPriceMaster.findMany({
      where,
      skip,
      take: limit,
      orderBy: [...buildOrderBy(params.sortField, params.sortDirection), { createdAt: "desc" }],
    }),
    prisma.medicalItemPriceMaster.count({ where }),
    prisma.medicalItemPriceMaster.count({ where: { expiresAt: { gt: now } } }),
    prisma.medicalItemPriceMaster.count({ where: { expiresAt: { lte: now } } }),
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

  return prisma.medicalItemPriceMaster.findMany({
    where: { ...where, expiresAt: { gt: new Date() } },
    take: limit,
    orderBy: [{ itemName: "asc" }, { createdAt: "desc" }],
  });
}

export async function createMedicalItem(data: any) {
  try {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // default expires in 1 year
    
    await prisma.medicalItemPriceMaster.create({
      data: {
        itemName: data.itemName,
        itemGenericName: data.itemGenericName,
        itemTypeCode: data.itemTypeCode,
        itemTypeName: data.itemTypeName,
        itemGroup: data.itemGroup,
        marketPriceMax: data.marketPriceMax,
        marketPriceAvg: data.marketPriceAvg,
        currency: data.currency || "IDR",
        sources: data.sources || [],
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : expiresAt,
      }
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateMedicalItem(id: string, data: any) {
  try {
    await prisma.medicalItemPriceMaster.update({
      where: { id },
      data: {
        itemName: data.itemName,
        itemGenericName: data.itemGenericName,
        itemTypeCode: data.itemTypeCode,
        itemTypeName: data.itemTypeName,
        itemGroup: data.itemGroup,
        marketPriceMax: data.marketPriceMax,
        marketPriceAvg: data.marketPriceAvg,
        currency: data.currency,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      }
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteMedicalItem(id: string) {
  try {
    await prisma.medicalItemPriceMaster.delete({
      where: { id }
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function importMedicalItems(items: any[]) {
  try {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    let importedCount = 0;
    
    for (const item of items) {
      if (!item.itemName || !item.marketPriceMax) continue;
      
      await prisma.medicalItemPriceMaster.upsert({
        where: { itemName: item.itemName },
        update: {
          itemGenericName: item.itemGenericName,
          itemTypeCode: item.itemTypeCode,
          itemGroup: item.itemGroup,
          marketPriceMax: Number(item.marketPriceMax),
          marketPriceAvg: item.marketPriceAvg ? Number(item.marketPriceAvg) : null,
          currency: item.currency || "IDR",
        },
        create: {
          itemName: item.itemName,
          itemGenericName: item.itemGenericName,
          itemTypeCode: item.itemTypeCode,
          itemGroup: item.itemGroup,
          marketPriceMax: Number(item.marketPriceMax),
          marketPriceAvg: item.marketPriceAvg ? Number(item.marketPriceAvg) : null,
          currency: item.currency || "IDR",
          sources: ["MANUAL_IMPORT"],
          expiresAt: expiresAt,
        }
      });
      importedCount++;
    }
    
    return { success: true, importedCount };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

