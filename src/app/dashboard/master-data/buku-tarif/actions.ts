"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { buildTariffCategoryOptions } from "./categories";

export async function getTariffEntries(params: { providerId?: string, category?: string, page?: number, limit?: number }) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const skip = (page - 1) * limit;

  const whereClause: any = {};
  if (params.providerId) whereClause.providerId = params.providerId;
  if (params.category) whereClause.category = params.category;

  const [entries, total, active, inactive] = await Promise.all([
    prisma.tariffEntry.findMany({
      where: whereClause,
      include: { provider: { select: { name: true } } },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tariffEntry.count({ where: whereClause }),
    prisma.tariffEntry.count({ where: { ...whereClause, isActive: true } }),
    prisma.tariffEntry.count({ where: { ...whereClause, isActive: false } })
  ]);

  return { entries, total, totalPages: Math.ceil(total / limit), summary: { active, inactive } };
}

export async function getProviders() {
  return await prisma.provider.findMany({ orderBy: { name: 'asc' } });
}

export async function getTariffCategoryOptions() {
  const categories = await prisma.tariffEntry.findMany({
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });

  return buildTariffCategoryOptions(categories.map((item) => item.category));
}

export async function createTariffEntry(formData: any) {
  try {
    const entry = await prisma.tariffEntry.create({
      data: {
        providerId: formData.providerId,
        procedureCode: formData.procedureCode,
        procedureName: formData.procedureName,
        category: formData.category,
        regionCode: formData.regionCode,
        basePrice: Number(formData.basePrice),
        maxPrice: Number(formData.maxPrice),
        currency: formData.currency || "IDR",
        effectiveFrom: new Date(formData.effectiveFrom),
        effectiveTo: formData.effectiveTo ? new Date(formData.effectiveTo) : null,
        isActive: formData.isActive ?? true,
      }
    });
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true, data: entry };
  } catch (error: any) {
    console.error("Create entry error:", error);
    return { success: false, error: error.message || "Failed to create entry" };
  }
}

export async function updateTariffEntry(id: string, formData: any) {
  try {
    const entry = await prisma.tariffEntry.update({
      where: { id },
      data: {
        providerId: formData.providerId,
        procedureCode: formData.procedureCode,
        procedureName: formData.procedureName,
        category: formData.category,
        regionCode: formData.regionCode,
        basePrice: Number(formData.basePrice),
        maxPrice: Number(formData.maxPrice),
        currency: formData.currency,
        effectiveFrom: new Date(formData.effectiveFrom),
        effectiveTo: formData.effectiveTo ? new Date(formData.effectiveTo) : null,
        isActive: formData.isActive,
      }
    });
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true, data: entry };
  } catch (error: any) {
    console.error("Update entry error:", error);
    return { success: false, error: error.message || "Failed to update entry" };
  }
}

export async function deactivateTariffEntry(id: string) {
  try {
    await prisma.tariffEntry.update({
      where: { id },
      data: { isActive: false }
    });
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to deactivate entry" };
  }
}

export async function getTariffEntryById(id: string) {
  return await prisma.tariffEntry.findUnique({
    where: { id }
  });
}

export async function bulkInsertTariffEntries(entries: any[]) {
  try {
    const dataToInsert = entries.map((entry: any) => ({
      providerId: entry.providerId,
      procedureCode: entry.procedureCode,
      procedureName: entry.procedureName,
      category: entry.category,
      regionCode: entry.regionCode,
      basePrice: Number(entry.basePrice),
      maxPrice: Number(entry.maxPrice),
      currency: entry.currency || "IDR",
      effectiveFrom: new Date(entry.effectiveFrom),
      effectiveTo: entry.effectiveTo ? new Date(entry.effectiveTo) : null,
      isActive: entry.isActive ?? true,
    }));

    const result = await prisma.tariffEntry.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });
    
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true, inserted: result.count };
  } catch (error: any) {
    console.error("Bulk insert error:", error);
    return { success: false, error: error.message || "Failed to bulk insert" };
  }
}
