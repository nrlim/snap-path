"use server";

import prisma from "@/lib/db";

import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";

export async function getPathwayJobs() {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const isPlatformAdmin = isPlatformAdminRole(user.role);
  const whereClause: any = { jobType: "CLAIM_VALIDATION" };
  
  if (!isPlatformAdmin) {
    if (!user.clientId) return [];
    whereClause.clientId = user.clientId;
  }

  const jobs = await prisma.claimJob.findMany({
    where: whereClause,
    include: { provider: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  
  return jobs;
}

export async function getPathwayResult(jobId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const job = await prisma.claimJob.findUnique({
    where: { id: jobId },
    include: {
      provider: { select: { name: true } }
    }
  });
  
  if (!job) return null;

  const isPlatformAdmin = isPlatformAdminRole(user.role);
  if (!isPlatformAdmin && job.clientId !== user.clientId) {
    return null;
  }

  return job;
}
