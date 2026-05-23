"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";

type Job = {
  id: string;
  status: string;
  createdAt: Date | string;
  inputPayload: any;
  outputResult?: any;
  provider: { name: string } | null;
};

type SortField = "createdAt" | "patient" | "provider" | "totalClaim" | "status" | "score";

function getTotalClaim(input: any) {
  let totalClaim = input?.totalClaimAmount;
  if (!totalClaim && input) {
    const procTotal = (input.procedures || []).reduce((acc: number, p: any) => acc + ((p.totalPrice ?? ((p.price || p.unitPrice || 0) * (p.quantity || 1))) || 0), 0);
    const medTotal = (input.medications || []).reduce((acc: number, m: any) => acc + ((m.totalPrice ?? ((m.price || m.unitPrice || 0) * (m.quantity || 1))) || 0), 0);
    totalClaim = procTotal + medTotal;
  }
  return Number(totalClaim || 0);
}

function statusBadge(status: string) {
  if (status === "COMPLETED") return <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-500/20">Completed</span>;
  if (status === "FAILED") return <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-500/20">Failed</span>;
  return <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600 ring-1 ring-inset ring-blue-500/20 animate-pulse">Processing</span>;
}

function sortValue(job: Job, field: SortField) {
  const input = job.inputPayload as any;
  if (field === "createdAt") return new Date(job.createdAt).getTime();
  if (field === "patient") return String(input?.patient?.name || "").toLowerCase();
  if (field === "provider") return String(job.provider?.name || "").toLowerCase();
  if (field === "totalClaim") return getTotalClaim(input);
  if (field === "score") return Number(job.outputResult?.overallScore || job.outputResult?.validationScore || 0);
  return job.status.toLowerCase();
}

export default function PathwayValidationTable({ jobs }: { jobs: Job[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const providers = useMemo(() => Array.from(new Set(jobs.map((job) => job.provider?.name).filter(Boolean) as string[])).sort(), [jobs]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs
      .filter((job) => {
        const input = job.inputPayload as any;
        const matchesSearch = !query || [input?.patient?.name || "", job.provider?.name || "", job.id, job.status].some((value) => String(value).toLowerCase().includes(query));
        const matchesStatus = statusFilter === "all" || job.status === statusFilter;
        const matchesProvider = providerFilter === "all" || job.provider?.name === providerFilter;
        return matchesSearch && matchesStatus && matchesProvider;
      })
      .sort((a, b) => {
        const aValue = sortValue(a, sortField);
        const bValue = sortValue(b, sortField);
        const result = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        return sortDirection === "asc" ? result : -result;
      });
  }, [jobs, providerFilter, search, sortDirection, sortField, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  return (
    <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
      <div className="grid grid-cols-1 gap-3 border-b border-border/60 p-4 lg:grid-cols-[1fr_180px_220px_120px]">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search patient, provider, job ID..." />
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">
          <option value="all">Semua status</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="QUEUED">Queued</option><option value="INIT">Init</option><option value="DOC_VAL">Processing</option>
        </select>
        <select value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">
          <option value="all">Semua provider</option>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
        </select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">{defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle uppercase tracking-wider border-b border-border/80">
            <tr><th className="px-4 py-3"><SortButton field="createdAt" label="Date" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3"><SortButton field="patient" label="Patient Name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3"><SortButton field="provider" label="Provider" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-right"><SortButton field="totalClaim" label="Total Claim" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-center"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-right"><SortButton field="score" label="Score" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {paginatedJobs.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-text-subtle">Tidak ada validasi yang sesuai filter.</td></tr> : paginatedJobs.map((job) => {
              const input = job.inputPayload as any;
              const totalClaim = getTotalClaim(input);
              const currency = input?.currency || "IDR";
              const score = job.outputResult?.overallScore || job.outputResult?.validationScore;
              return <tr key={job.id} className="transition-colors hover:bg-surface-elevated/40"><td className="px-4 py-3 whitespace-nowrap text-text-subtle">{new Date(job.createdAt).toLocaleDateString("id-ID", { month: "short", day: "numeric", year: "numeric" })}</td><td className="px-4 py-3 font-medium text-text">{input?.patient?.name || "Unknown Patient"}</td><td className="px-4 py-3 text-text-subtle">{job.provider?.name || "-"}</td><td className="px-4 py-3 text-right font-medium">{totalClaim ? new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(totalClaim) : "-"}</td><td className="px-4 py-3 text-center">{statusBadge(job.status)}</td><td className="px-4 py-3 text-right font-mono font-bold text-text">{typeof score === "number" ? score : "-"}</td><td className="px-4 py-3 text-right"><Link href={`/dashboard/clinical-pathway/${job.id}`} className="inline-flex items-center justify-center rounded-md bg-surface-elevated px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white">View Results</Link></td></tr>;
            })}
          </tbody>
        </table>
      </div>
      <TablePagination total={filteredJobs.length} visible={paginatedJobs.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
    </div>
  );
}
