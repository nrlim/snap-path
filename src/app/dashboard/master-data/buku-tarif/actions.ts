"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { buildTariffCategoryOptions } from "./categories";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";

export type TariffSortField = "procedure" | "provider" | "category" | "basePrice" | "maxPrice" | "status";
export type TariffSortDirection = "asc" | "desc";

export type GetTariffEntriesParams = {
  providerId?: string;
  category?: string;
  status?: "all" | "active" | "inactive";
  search?: string;
  page?: number;
  limit?: number;
  sortField?: TariffSortField;
  sortDirection?: TariffSortDirection;
  excludeCategory?: string;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function booleanValue(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function buildTariffPayload(formData: Record<string, unknown>) {
  const providerId = stringValue(formData.providerId);
  const procedureCode = stringValue(formData.procedureCode);
  const procedureName = stringValue(formData.procedureName);
  const category = stringValue(formData.category);
  const basePrice = numberValue(formData.basePrice);
  const maxPrice = numberValue(formData.maxPrice);
  const effectiveFrom = dateValue(formData.effectiveFrom);

  if (!providerId || !procedureCode || !procedureName || !category || basePrice === null || maxPrice === null || !effectiveFrom) {
    return null;
  }

  return {
    providerId,
    procedureCode,
    procedureName,
    category,
    regionCode: stringValue(formData.regionCode) ?? null,
    basePrice,
    maxPrice,
    currency: stringValue(formData.currency) ?? "IDR",
    effectiveFrom,
    effectiveTo: dateValue(formData.effectiveTo),
    isActive: booleanValue(formData.isActive),
  } satisfies Prisma.TariffEntryUncheckedCreateInput;
}

function buildOrderBy(field: TariffSortField = "procedure", direction: TariffSortDirection = "asc"): Prisma.TariffEntryOrderByWithRelationInput {
  const sortDirection: Prisma.SortOrder = direction === "desc" ? "desc" : "asc";

  switch (field) {
    case "provider":
      return { provider: { name: sortDirection } };
    case "category":
      return { category: sortDirection };
    case "basePrice":
      return { basePrice: sortDirection };
    case "maxPrice":
      return { maxPrice: sortDirection };
    case "status":
      return { isActive: sortDirection };
    case "procedure":
    default:
      return { procedureName: sortDirection };
  }
}

export async function getTariffEntries(params: GetTariffEntriesParams = {}) {
  const user = await getAuthenticatedUser();
  if (!user) return { entries: [], total: 0, totalPages: 0, summary: { active: 0, inactive: 0 } };

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
  const skip = (page - 1) * limit;
  const whereClause: Prisma.TariffEntryWhereInput = {};

  if (params.providerId && params.providerId !== "all") whereClause.providerId = params.providerId;
  if (params.category && params.category !== "all") {
    whereClause.category = params.category;
  } else if (params.excludeCategory) {
    whereClause.category = { not: params.excludeCategory };
  }
  if (params.status === "active") whereClause.isActive = true;
  if (params.status === "inactive") whereClause.isActive = false;

  const query = params.search?.trim();
  if (query) {
    const contains = { contains: query, mode: "insensitive" as const };
    whereClause.OR = [
      { procedureCode: contains },
      { procedureName: contains },
      { category: contains },
      { subcategory: contains },
      { serviceCode: contains },
      { unit: contains },
      { regionCode: contains },
      { currency: contains },
      { notes: contains },
      { provider: { name: contains } },
    ];
  }

  // Tenant isolation: non-admin users can only see their client's providers.
  if (!isPlatformAdminRole(user.role)) {
    if (!user.clientId) return { entries: [], total: 0, totalPages: 0, summary: { active: 0, inactive: 0 } };
    whereClause.provider = { clientId: user.clientId };
  }

  const orderBy = buildOrderBy(params.sortField, params.sortDirection);

  const [entries, total, active, inactive] = await Promise.all([
    prisma.tariffEntry.findMany({
      where: whereClause,
      include: { provider: { select: { name: true } } },
      skip,
      take: limit,
      orderBy: [orderBy, { createdAt: "desc" }],
    }),
    prisma.tariffEntry.count({ where: whereClause }),
    prisma.tariffEntry.count({ where: { ...whereClause, isActive: true } }),
    prisma.tariffEntry.count({ where: { ...whereClause, isActive: false } })
  ]);

  return { entries, total, totalPages: Math.max(1, Math.ceil(total / limit)), summary: { active, inactive } };
}

export async function getProviders() {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const where = isPlatformAdminRole(user.role) || !user.clientId ? {} : { clientId: user.clientId };
  return await prisma.provider.findMany({ where, orderBy: { name: "asc" } });
}

export async function getTariffCategoryOptions() {
  const user = await getAuthenticatedUser();
  if (!user) return buildTariffCategoryOptions([]);

  const where: Prisma.TariffEntryWhereInput = isPlatformAdminRole(user.role) || !user.clientId
    ? {}
    : { provider: { clientId: user.clientId } };

  const categories = await prisma.tariffEntry.findMany({
    where,
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });

  return buildTariffCategoryOptions(categories.map((item) => item.category));
}

export async function createTariffEntry(formData: Record<string, unknown>) {
  const user = await getAuthenticatedUser();
  if (!user || !isPlatformAdminRole(user.role)) {
    return { success: false, error: "Forbidden. Only admins can create tariff entries." };
  }

  const payload = buildTariffPayload(formData);
  if (!payload) return { success: false, error: "Data tarif tidak valid atau belum lengkap." };

  try {
    const entry = await prisma.tariffEntry.create({ data: payload });
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true, data: entry };
  } catch (error) {
    console.error("[tariff/create]", { message: error instanceof Error ? error.message : "Unknown" });
    return { success: false, error: "Failed to create entry" };
  }
}

export async function updateTariffEntry(id: string, formData: Record<string, unknown>) {
  const user = await getAuthenticatedUser();
  if (!user || !isPlatformAdminRole(user.role)) {
    return { success: false, error: "Forbidden." };
  }

  const payload = buildTariffPayload(formData);
  if (!payload) return { success: false, error: "Data tarif tidak valid atau belum lengkap." };

  try {
    const entry = await prisma.tariffEntry.update({
      where: { id },
      data: payload,
    });
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true, data: entry };
  } catch (error) {
    console.error("[tariff/update]", { message: error instanceof Error ? error.message : "Unknown" });
    return { success: false, error: "Failed to update entry" };
  }
}

export async function deactivateTariffEntry(id: string) {
  const user = await getAuthenticatedUser();
  if (!user || !isPlatformAdminRole(user.role)) {
    return { success: false, error: "Forbidden." };
  }

  try {
    await prisma.tariffEntry.update({
      where: { id },
      data: { isActive: false }
    });
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true };
  } catch (error) {
    console.error("[tariff/deactivate]", { message: error instanceof Error ? error.message : "Unknown" });
    return { success: false, error: "Failed to deactivate entry" };
  }
}

export async function getTariffEntryById(id: string) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const where: Prisma.TariffEntryWhereUniqueInput = { id };
  const entry = await prisma.tariffEntry.findUnique({
    where,
    include: { provider: { select: { clientId: true } } },
  });

  if (!entry) return null;
  if (!isPlatformAdminRole(user.role) && entry.provider.clientId !== user.clientId) return null;

  return entry;
}

export async function bulkInsertTariffEntries(entries: Array<Record<string, unknown>>) {
  const user = await getAuthenticatedUser();
  if (!user || !isPlatformAdminRole(user.role)) {
    return { success: false, error: "Forbidden." };
  }

  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 500) {
    return { success: false, error: "Invalid entries. Maximum 500 per batch." };
  }

  const dataToInsert: Prisma.TariffEntryCreateManyInput[] = [];
  for (const entry of entries) {
    const payload = buildTariffPayload(entry);
    if (!payload) return { success: false, error: "Invalid tariff entry in batch." };
    dataToInsert.push(payload);
  }

  try {
    const result = await prisma.tariffEntry.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true, inserted: result.count };
  } catch (error) {
    console.error("[tariff/bulk-insert]", { message: error instanceof Error ? error.message : "Unknown" });
    return { success: false, error: "Failed to bulk insert" };
  }
}
