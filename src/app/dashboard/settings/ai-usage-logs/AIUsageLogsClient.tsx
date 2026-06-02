"use client";

import { useMemo, useState } from "react";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";

const USD_TO_IDR = 16000;

type SummaryCard = { clientName: string; requests: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number };
type JobCost = { clientName: string; jobId: string; requests: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; lastRequestAt: string };
type AIUsageLog = { id: string; clientName: string; jobId: string | null; endpoint: string; aiProvider?: string | null; aiModel?: string | null; inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number; costUsd: number; createdAt: string };

type JobSortField = "lastRequestAt" | "clientName" | "jobId" | "requests" | "inputTokens" | "outputTokens" | "totalTokens" | "costUsd";
type LogSortField = "createdAt" | "clientName" | "endpoint" | "aiModel" | "inputTokens" | "outputTokens" | "totalTokens" | "costUsd" | "durationMs";

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
}

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value * USD_TO_IDR);
}

function compareValues(a: string | number, b: string | number, direction: SortDirection) {
  const result = a > b ? 1 : a < b ? -1 : 0;
  return direction === "asc" ? result : -result;
}

export default function AIUsageLogsClient({ summaryCards, jobCosts, logs, canSeeTechnicalDetails }: { summaryCards: SummaryCard[]; jobCosts: JobCost[]; logs: AIUsageLog[]; canSeeTechnicalDetails: boolean }) {
  const [jobSearch, setJobSearch] = useState("");
  const [jobClientFilter, setJobClientFilter] = useState("all");
  const [jobSortField, setJobSortField] = useState<JobSortField>("lastRequestAt");
  const [jobSortDirection, setJobSortDirection] = useState<SortDirection>("desc");
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState(10);

  const [logSearch, setLogSearch] = useState("");
  const [logClientFilter, setLogClientFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [logSortField, setLogSortField] = useState<LogSortField>("createdAt");
  const [logSortDirection, setLogSortDirection] = useState<SortDirection>("desc");
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(10);

  const clients = useMemo(() => Array.from(new Set([...jobCosts.map((job) => job.clientName), ...logs.map((log) => log.clientName)])).sort(), [jobCosts, logs]);
  const models = useMemo(() => Array.from(new Set(logs.map((log) => log.aiModel || "default"))).sort(), [logs]);

  const filteredJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    return jobCosts
      .filter((job) => {
        const matchesSearch = !query || [job.clientName, job.jobId].some((value) => value.toLowerCase().includes(query));
        const matchesClient = jobClientFilter === "all" || job.clientName === jobClientFilter;
        return matchesSearch && matchesClient;
      })
      .sort((a, b) => {
        const aValue = jobSortField === "lastRequestAt" ? new Date(a.lastRequestAt).getTime() : a[jobSortField];
        const bValue = jobSortField === "lastRequestAt" ? new Date(b.lastRequestAt).getTime() : b[jobSortField];
        return compareValues(aValue, bValue, jobSortDirection);
      });
  }, [jobClientFilter, jobCosts, jobSearch, jobSortDirection, jobSortField]);

  const filteredLogs = useMemo(() => {
    const query = logSearch.trim().toLowerCase();
    return logs
      .filter((log) => {
        const searchValues = canSeeTechnicalDetails
          ? [log.clientName, log.endpoint, log.aiModel || "", log.aiProvider || "", log.jobId || ""]
          : [log.clientName, log.endpoint, log.jobId || ""];
        const matchesSearch = !query || searchValues.some((value) => value.toLowerCase().includes(query));
        const matchesClient = logClientFilter === "all" || log.clientName === logClientFilter;
        const matchesModel = !canSeeTechnicalDetails || modelFilter === "all" || (log.aiModel || "default") === modelFilter;
        return matchesSearch && matchesClient && matchesModel;
      })
      .sort((a, b) => {
        const aValue = logSortField === "createdAt" ? new Date(a.createdAt).getTime() : (a[logSortField] ?? "");
        const bValue = logSortField === "createdAt" ? new Date(b.createdAt).getTime() : (b[logSortField] ?? "");
        return compareValues(aValue, bValue, logSortDirection);
      });
  }, [canSeeTechnicalDetails, logClientFilter, logSearch, logSortDirection, logSortField, logs, modelFilter]);

  const jobTotalPages = Math.max(1, Math.ceil(filteredJobs.length / jobPageSize));
  const jobCurrentPage = Math.min(jobPage, jobTotalPages);
  const paginatedJobs = filteredJobs.slice((jobCurrentPage - 1) * jobPageSize, jobCurrentPage * jobPageSize);

  const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / logPageSize));
  const logCurrentPage = Math.min(logPage, logTotalPages);
  const paginatedLogs = filteredLogs.slice((logCurrentPage - 1) * logPageSize, logCurrentPage * logPageSize);

  function handleJobSort(field: JobSortField) {
    if (jobSortField === field) setJobSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setJobSortField(field); setJobSortDirection("asc"); }
  }

  function handleLogSort(field: LogSortField) {
    if (logSortField === field) setLogSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setLogSortField(field); setLogSortDirection("asc"); }
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {summaryCards.map((item) => (
          <div key={item.clientName} className="rounded-lg border border-border/80 bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-text-subtle">{item.clientName}</p>
            <p className="mt-3 text-2xl font-extrabold text-text">{formatNumber(item.totalTokens)}</p>
            <p className="mt-1 text-xs text-text-subtle">{formatNumber(item.requests)} request AI bulan ini</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span>Input: {formatNumber(item.inputTokens)}</span><span>Output: {formatNumber(item.outputTokens)}</span></div>
            <div className="mt-3 rounded-md bg-surface-elevated/50 px-3 py-2 text-xs font-semibold text-text">Estimasi layanan: {formatUsd(item.costUsd)} / {formatIdr(item.costUsd)}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border/80 bg-surface shadow-sm">
        <div className="border-b border-border/60 px-5 py-4"><h2 className="text-base font-bold text-text">Estimasi Pemakaian per Job Clinical Pathway</h2><p className="mt-1 text-sm text-text-subtle">Menggabungkan seluruh call dalam satu jobId agar estimasi pemakaian per workflow mudah diaudit.</p></div>
        <div className="grid grid-cols-1 gap-3 border-b border-border/60 p-4 lg:grid-cols-[1fr_220px_120px]">
          <TableSearch value={jobSearch} onChange={(value) => { setJobSearch(value); setJobPage(1); }} placeholder="Search client atau job ID..." />
          <select value={jobClientFilter} onChange={(event) => { setJobClientFilter(event.target.value); setJobPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm"><option value="all">Semua client</option>{clients.map((client) => <option key={client} value={client}>{client}</option>)}</select>
          <select value={jobPageSize} onChange={(event) => { setJobPageSize(Number(event.target.value)); setJobPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">{defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-surface-elevated/50 text-xs uppercase tracking-wider text-text-subtle"><tr><th className="px-4 py-3"><SortButton field="lastRequestAt" label="Last Request" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th><th className="px-4 py-3"><SortButton field="clientName" label="Client" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th><th className="px-4 py-3"><SortButton field="jobId" label="Job ID" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th><th className="px-4 py-3 text-right"><SortButton field="requests" label="AI Calls" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th><th className="px-4 py-3 text-right"><SortButton field="inputTokens" label="Input" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th><th className="px-4 py-3 text-right"><SortButton field="outputTokens" label="Output" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th><th className="px-4 py-3 text-right"><SortButton field="totalTokens" label="Total" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th><th className="px-4 py-3 text-right"><SortButton field="costUsd" label="Est. Usage" sortField={jobSortField} sortDirection={jobSortDirection} onSort={handleJobSort} /></th></tr></thead><tbody className="divide-y divide-border/60">{paginatedJobs.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-text-subtle">Tidak ada job yang sesuai filter.</td></tr> : paginatedJobs.map((job) => <tr key={job.jobId} className="hover:bg-surface-elevated/30"><td className="px-4 py-3 text-xs text-text-subtle">{formatDate(job.lastRequestAt)}</td><td className="px-4 py-3 font-medium text-text">{job.clientName}</td><td className="px-4 py-3 font-mono text-xs text-text-subtle">{job.jobId}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(job.requests)}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(job.inputTokens)}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(job.outputTokens)}</td><td className="px-4 py-3 text-right font-mono font-bold text-text">{formatNumber(job.totalTokens)}</td><td className="px-4 py-3 text-right font-mono"><div className="font-bold text-text">{formatUsd(job.costUsd)}</div><div className="mt-0.5 text-xs font-semibold text-text-subtle">{formatIdr(job.costUsd)}</div></td></tr>)}</tbody></table></div>
        <TablePagination total={filteredJobs.length} visible={paginatedJobs.length} currentPage={jobCurrentPage} totalPages={jobTotalPages} onPrev={() => setJobPage((value) => Math.max(1, value - 1))} onNext={() => setJobPage((value) => Math.min(jobTotalPages, value + 1))} />
      </section>

      <section className="rounded-lg border border-border/80 bg-surface shadow-sm">
        <div className="border-b border-border/60 px-5 py-4"><h2 className="text-base font-bold text-text">Log Request AI</h2><p className="mt-1 text-sm text-text-subtle">{canSeeTechnicalDetails ? 'Detail setiap call AI termasuk endpoint internal, token consumption, dan estimasi pemakaian.' : 'Detail setiap call AI, token consumption, dan estimasi pemakaian. Detail provider dan model disembunyikan untuk client.'}</p></div>
        <div className={`grid grid-cols-1 gap-3 border-b border-border/60 p-4 ${canSeeTechnicalDetails ? 'lg:grid-cols-[1fr_220px_180px_120px]' : 'lg:grid-cols-[1fr_220px_120px]'}`}><TableSearch value={logSearch} onChange={(value) => { setLogSearch(value); setLogPage(1); }} placeholder={canSeeTechnicalDetails ? "Search endpoint, client, job ID, provider, model..." : "Search operation, client, job ID..."} /><select value={logClientFilter} onChange={(event) => { setLogClientFilter(event.target.value); setLogPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm"><option value="all">Semua client</option>{clients.map((client) => <option key={client} value={client}>{client}</option>)}</select>{canSeeTechnicalDetails && <select value={modelFilter} onChange={(event) => { setModelFilter(event.target.value); setLogPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm"><option value="all">Semua model</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select>}<select value={logPageSize} onChange={(event) => { setLogPageSize(Number(event.target.value)); setLogPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">{defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-surface-elevated/50 text-xs uppercase tracking-wider text-text-subtle"><tr><th className="px-4 py-3"><SortButton field="createdAt" label="Waktu" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th><th className="px-4 py-3"><SortButton field="clientName" label="Client" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th><th className="px-4 py-3"><SortButton field="endpoint" label="AI Operation" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th>{canSeeTechnicalDetails && <th className="px-4 py-3 text-text-subtle">Provider</th>}{canSeeTechnicalDetails && <th className="px-4 py-3"><SortButton field="aiModel" label="Model" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th>}<th className="px-4 py-3 text-right"><SortButton field="inputTokens" label="Input" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th><th className="px-4 py-3 text-right"><SortButton field="outputTokens" label="Output" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th><th className="px-4 py-3 text-right"><SortButton field="totalTokens" label="Total" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th><th className="px-4 py-3 text-right"><SortButton field="costUsd" label="Est. Usage" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th><th className="px-4 py-3 text-right"><SortButton field="durationMs" label="Durasi" sortField={logSortField} sortDirection={logSortDirection} onSort={handleLogSort} /></th></tr></thead><tbody className="divide-y divide-border/60">{paginatedLogs.length === 0 ? <tr><td colSpan={canSeeTechnicalDetails ? 10 : 8} className="px-4 py-10 text-center text-text-subtle">Tidak ada log yang sesuai filter.</td></tr> : paginatedLogs.map((log) => <tr key={log.id} className="hover:bg-surface-elevated/30"><td className="px-4 py-3 text-xs text-text-subtle">{formatDate(log.createdAt)}</td><td className="px-4 py-3 font-medium text-text">{log.clientName}</td><td className="px-4 py-3 text-xs text-text-subtle">{log.endpoint}</td>{canSeeTechnicalDetails && <td className="px-4 py-3 text-text-subtle">{log.aiProvider || "-"}</td>}{canSeeTechnicalDetails && <td className="px-4 py-3 text-text-subtle">{log.aiModel || "default"}</td>}<td className="px-4 py-3 text-right font-mono">{formatNumber(log.inputTokens)}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(log.outputTokens)}</td><td className="px-4 py-3 text-right font-mono font-bold text-text">{formatNumber(log.totalTokens)}</td><td className="px-4 py-3 text-right font-mono"><div className="font-bold text-text">{formatUsd(log.costUsd)}</div><div className="mt-0.5 text-xs font-semibold text-text-subtle">{formatIdr(log.costUsd)}</div></td><td className="px-4 py-3 text-right text-text-subtle">{log.durationMs}ms</td></tr>)}</tbody></table></div>
        <TablePagination total={filteredLogs.length} visible={paginatedLogs.length} currentPage={logCurrentPage} totalPages={logTotalPages} onPrev={() => setLogPage((value) => Math.max(1, value - 1))} onNext={() => setLogPage((value) => Math.min(logTotalPages, value + 1))} />
      </section>
    </div>
  );
}
