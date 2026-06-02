"use server";

import prisma from "@/lib/db";

export async function getDrugPriceCacheEntries(params: { page?: number; limit?: number } = {}) {
  const page = params.page || 1;
  const limit = params.limit || 1000;
  const skip = (page - 1) * limit;
  const now = new Date();

  const [entries, total, active, expired] = await Promise.all([
    prisma.medicalItemPriceCache.findMany({
      skip,
      take: limit,
      orderBy: { fetchedAt: "desc" },
    }),
    prisma.medicalItemPriceCache.count(),
    prisma.medicalItemPriceCache.count({ where: { expiresAt: { gt: now } } }),
    prisma.medicalItemPriceCache.count({ where: { expiresAt: { lte: now } } }),
  ]);

  return {
    entries,
    total,
    totalPages: Math.ceil(total / limit),
    summary: { active, expired },
  };
}
