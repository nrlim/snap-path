import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getAuthenticatedUser, hasPermission, isSuperAdminRole } from "@/lib/rbac";
import { updateAIUsageMarkupConfig } from "../actions";
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

function applyMarkup(costUsd: number, markupPct: number) {
  return costUsd * (1 + (markupPct / 100));
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

  const config = await prisma.systemConfig.findUnique({ where: { id: "GLOBAL_CONFIG" } });
  const markupPct = config?.aiUsageMarkupPct ?? 100;
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
    current.costUsd += applyMarkup(estimateBaseCostUsd(log), markupPct);
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
    current.costUsd += applyMarkup(estimateBaseCostUsd(log), markupPct);
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
    costUsd: applyMarkup(estimateBaseCostUsd(log), markupPct),
    createdAt: log.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">AI Usage Logs</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-subtle">
            Hanya mencatat request AI. {canSeeTechnicalDetails ? "Super admin dapat melihat detail teknis dan mengatur markup pemakaian layanan." : "Detail provider dan model disembunyikan pada dashboard client."}
          </p>
        </div>
        {canSeeTechnicalDetails && (
          <form action={async (formData) => {
            "use server";
            await updateAIUsageMarkupConfig(formData);
          }} className="rounded-xl border border-border/80 bg-surface p-4 shadow-sm">
            <label htmlFor="aiUsageMarkupPct" className="text-xs font-bold uppercase tracking-wider text-text-subtle">Markup usage (%)</label>
            <div className="mt-2 flex gap-2">
              <input id="aiUsageMarkupPct" name="aiUsageMarkupPct" type="number" min="0" step="1" defaultValue={markupPct} className="w-32 rounded-md border border-border bg-surface px-3 py-2 text-base text-text sm:text-sm" />
              <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">Simpan</button>
            </div>
            <p className="mt-2 text-xs text-text-subtle">Contoh: 100 berarti biaya layanan = 2x estimasi dasar.</p>
          </form>
        )}
      </div>
      <AIUsageLogsClient summaryCards={summaryCards} jobCosts={jobCosts} logs={serializedLogs} canSeeTechnicalDetails={canSeeTechnicalDetails} />
    </div>
  );
}
