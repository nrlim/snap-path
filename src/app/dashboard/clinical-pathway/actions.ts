"use server";

import prisma from "@/lib/db";

export async function getPathwayJobs() {
  const jobs = await prisma.claimJob.findMany({
    where: { jobType: "CLAIM_VALIDATION" },
    include: { provider: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  
  return jobs;
}

export async function getPathwayResult(jobId: string) {
  const job = await prisma.claimJob.findUnique({
    where: { id: jobId },
    include: {
      provider: { select: { name: true } }
    }
  });
  
  return job;
}
