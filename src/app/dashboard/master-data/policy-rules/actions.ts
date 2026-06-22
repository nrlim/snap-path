"use server";

import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

type PolicyRuleSortField = "ruleCode" | "ruleName" | "ruleType" | "status" | "updatedAt";
type SortDirection = "asc" | "desc";

export async function getPolicyRules(params: { page?: number; limit?: number; search?: string; status?: string; ruleType?: string; sortField?: PolicyRuleSortField; sortDirection?: SortDirection } = {}) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("Unauthorized");

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.PolicyRuleWhereInput = {};
  
  if (user.role === 'CLIENT_ADMIN' || user.role === 'CLIENT_USER') {
    where.clientId = user.clientId;
  } else if (user.role !== 'SUPER_ADMIN') {
    where.clientId = null;
  }

  if (params.search?.trim()) {
    const query = params.search.trim();
    where.OR = [
      { ruleCode: { contains: query, mode: "insensitive" } },
      { ruleName: { contains: query, mode: "insensitive" } },
    ];
  }

  if (params.status && params.status !== "all") {
    where.status = params.status.toUpperCase();
  }
  
  if (params.ruleType && params.ruleType !== "all") {
    where.ruleType = params.ruleType.toUpperCase();
  }

  const orderBy: Prisma.PolicyRuleOrderByWithRelationInput[] = [];
  const direction: Prisma.SortOrder = params.sortDirection === "asc" ? "asc" : "desc";
  
  switch (params.sortField) {
    case "ruleCode": orderBy.push({ ruleCode: direction }); break;
    case "ruleName": orderBy.push({ ruleName: direction }); break;
    case "ruleType": orderBy.push({ ruleType: direction }); break;
    case "status": orderBy.push({ status: direction }); break;
    case "updatedAt":
    default: orderBy.push({ updatedAt: direction }); break;
  }

  const [entries, total] = await Promise.all([
    prisma.policyRule.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { client: { select: { name: true, code: true } } }
    }),
    prisma.policyRule.count({ where }),
  ]);

  return {
    entries,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function deletePolicyRule(id: string) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'CLIENT_ADMIN')) {
    throw new Error("Forbidden");
  }

  const existingRule = await prisma.policyRule.findUnique({ where: { id } });
  if (!existingRule) throw new Error("Not Found");
  
  if (user.role === 'CLIENT_ADMIN' && existingRule.clientId !== user.clientId) {
    throw new Error("Forbidden");
  }

  await prisma.policyRule.delete({ where: { id } });
  revalidatePath("/dashboard/master-data/policy-rules");
}
