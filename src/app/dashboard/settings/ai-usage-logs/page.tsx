import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getAuthenticatedUser, hasPermission, isSuperAdminRole } from "@/lib/rbac";
import AIUsageLogsClient from "./AIUsageLogsClient";

const DEFAULT_PRICING = { inputPerMillion: 0.15, outputPerMillion: 0.6 };
const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
};

type AIUsageLog = {
  id: string;
  clientId: string | null;
  jobId: string | null;
  endpoint: string;
  aiProvider: string | null;
  aiModel: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  createdAt: Date;
  client: { name: string; code: string } | null;
  apiKey: { name: string } | null;
};

function getPricing(model: string | null) {
  if (!model) return DEFAULT_PRICING;
  return MODEL_PRICING[model] || DEFAULT_PRICING;
}

function estimateBaseCostUsd(log: Pick<AIUsageLog, "aiModel" | "inputTokens" | "outputTokens">) {
  const pricing = getPricing(log.aiModel);
  return ((log.inputTokens / 1_000_000) * pricing.inputPerMillion) + ((log.outputTokens / 1_000_000) * pricing.outputPerMillion);
}

export default async function AIUsageLogsPage() {
  const user = await getAuthenticatedUser();
  if (!user || !hasPermission(user.role, "AI_USAGE_LOGS")) {
    redirect("/dashboard");
  }

  const canSeeTechnicalDetails = isSuperAdminRole(user.role);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const scopedWhere = canSeeTechnicalDetails ? {} : { clientId: user.clientId || "__none__" };

  const [logs, monthLogs] = await Promise.all([
    prisma.apiUsageLog.findMany({
      where: { ...scopedWhere, requestType: "AI" },
      include: { client: { select: { name: true, code: true } }, apiKey: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    prisma.apiUsageLog.findMany({
      where: { ...scopedWhere, requestType: "AI", createdAt: { gte: monthStart } },
      include: { client: { select: { name: true, code: true } }, apiKey: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]) as [AIUsageLog[], AIUsageLog[]];

  const summaryByClient = new Map<string, { clientName: string; requests: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number }>();
  for (const log of monthLogs) {
    const key = log.clientId || "internal";
    const current = summaryByClient.get(key) || { clientName: log.client?.name || "Global/Internal", requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
    current.requests += 1;
    current.inputTokens += log.inputTokens;
    current.outputTokens += log.outputTokens;
    current.totalTokens += log.totalTokens;
    current.costUsd += estimateBaseCostUsd(log);
    summaryByClient.set(key, current);
  }

  const summaryCards = Array.from(summaryByClient.values()).sort((a, b) => b.totalTokens - a.totalTokens);

  const costByJob = new Map<string, { clientName: string; jobId: string; requests: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; lastRequestAt: Date }>();
  for (const log of logs) {
    if (!log.jobId) continue;
    const current = costByJob.get(log.jobId) || {
      clientName: log.client?.name || "Global/Internal",
      jobId: log.jobId,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      lastRequestAt: log.createdAt,
    };
    current.requests += 1;
    current.inputTokens += log.inputTokens;
    current.outputTokens += log.outputTokens;
    current.totalTokens += log.totalTokens;
    current.costUsd += estimateBaseCostUsd(log);
    if (log.createdAt > current.lastRequestAt) current.lastRequestAt = log.createdAt;
    costByJob.set(log.jobId, current);
  }

  const jobCosts = Array.from(costByJob.values())
    .sort((a, b) => b.lastRequestAt.getTime() - a.lastRequestAt.getTime())
    .slice(0, 50)
    .map((job) => ({ ...job, lastRequestAt: job.lastRequestAt.toISOString() }));

  const serializedLogs = logs.map((log) => ({
    id: log.id,
    clientName: log.client?.name || "Global/Internal",
    jobId: log.jobId,
    endpoint: log.endpoint,
    aiProvider: canSeeTechnicalDetails ? log.aiProvider : null,
    aiModel: canSeeTechnicalDetails ? log.aiModel : null,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    totalTokens: log.totalTokens,
    durationMs: log.durationMs,
    costUsd: estimateBaseCostUsd(log),
    createdAt: log.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">AI Usage Logs</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Hanya mencatat request AI untuk audit biaya internal. Detail penggunaan dan credit hanya tersedia untuk super admin.
          </p>
        </div>
      </div>
      <AIUsageLogsClient summaryCards={summaryCards} jobCosts={jobCosts} logs={serializedLogs} canSeeTechnicalDetails={canSeeTechnicalDetails} />
    </div>
  );
}
