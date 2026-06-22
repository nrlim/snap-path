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

type ScoreBreakdownItem = {
  code?: string;
  label?: string;
  maxDeduction?: number;
  maxScore?: number;
  score?: number;
  deducted?: number;
};

function getDiagnosisFindingCounts(outputResult: any) {
  const details = Array.isArray(outputResult?.diagnosisValidation?.details)
    ? outputResult.diagnosisValidation.details
    : Array.isArray(outputResult?.diagnosisValidations)
      ? outputResult.diagnosisValidations
      : [];

  return details.reduce((counts: { missing: number; relevance: number; medication: number }, detail: any) => {
    const medicationFindings = Array.isArray(detail?.medicationFindings) ? detail.medicationFindings : [];
    counts.missing += detail?.missingRequiredProcedures?.length || 0;
    counts.relevance += detail?.irrelevantProcedures?.length || detail?.unmatchedProcedures?.length || 0;
    counts.medication += medicationFindings.filter((item: any) => item.status === "REVIEW_NEEDED" || item.status === "INAPPROPRIATE").length;
    return counts;
  }, { missing: 0, relevance: 0, medication: 0 });
}

function getDisplayScore(outputResult: any) {
  const rawScore = outputResult?.overallScore ?? outputResult?.validationScore;
  const items = outputResult?.scoreBreakdown?.items;
  if (!Array.isArray(items) || items.length === 0) return typeof rawScore === "number" ? rawScore : null;

  const findings = getDiagnosisFindingCounts(outputResult);
  const hasDiagnosisFindings = findings.missing > 0 || findings.relevance > 0 || findings.medication > 0;

  return items.reduce((total: number, item: ScoreBreakdownItem) => {
    const maxScore = item.maxScore ?? item.maxDeduction ?? 0;
    const isDiagnosisItem = item.code === "DIAGNOSIS_TREATMENT" || item.label === "Diagnosis, tindakan & obat klinis";
    const shouldClearHiddenDiagnosisDeduction = isDiagnosisItem
      && (item.deducted || 0) > 0
      && !hasDiagnosisFindings;
    const score = shouldClearHiddenDiagnosisDeduction
      ? maxScore
      : typeof item.score === "number"
        ? item.score
        : Math.max(0, maxScore - (item.deducted || 0));
    return total + score;
  }, 0);
}

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
  if (status === "COMPLETED") return <span className="inline-flex items-center rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 uppercase tracking-widest">Completed</span>;
  if (status === "FAILED") return <span className="inline-flex items-center rounded-sm bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20 uppercase tracking-widest">Failed</span>;
  return <span className="inline-flex items-center rounded-sm bg-background px-2 py-0.5 text-[10px] font-light text-muted-foreground ring-1 ring-inset ring-border uppercase tracking-widest animate-pulse">Processing</span>;
}

function sortValue(job: Job, field: SortField) {
  const input = job.inputPayload as any;
  if (field === "createdAt") return new Date(job.createdAt).getTime();
  if (field === "patient") return String(input?.patient?.name || "").toLowerCase();
  if (field === "provider") return String(job.provider?.name || "").toLowerCase();
  if (field === "totalClaim") return getTotalClaim(input);
  if (field === "score") return Number(getDisplayScore(job.outputResult) ?? 0);
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
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-1 gap-3 border-b border-border p-4 lg:grid-cols-[1fr_180px_220px_120px] bg-background">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search patient, provider, job ID..." />
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Semua status</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="QUEUED">Queued</option><option value="INIT">Init</option><option value="DOC_VAL">Processing</option>
        </select>
        <select value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Semua provider</option>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
        </select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20">{defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-muted/40 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground border-b border-border">
            <tr>
              <th className="px-5 py-4"><SortButton field="createdAt" label="Date" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4"><SortButton field="patient" label="Patient Name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4"><SortButton field="provider" label="Provider" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right"><SortButton field="totalClaim" label="Total Claim" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-center"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right"><SortButton field="score" label="Score" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedJobs.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-light text-muted-foreground">Tidak ada validasi yang sesuai filter.</td></tr> : paginatedJobs.map((job) => {
              const input = job.inputPayload as any;
              const totalClaim = getTotalClaim(input);
              const currency = input?.currency || "IDR";
              const score = getDisplayScore(job.outputResult);
              return <tr key={job.id} className="transition-colors hover:bg-muted/50">
                <td className="px-5 py-4 whitespace-nowrap text-xs font-mono text-muted-foreground">{new Date(job.createdAt).toLocaleDateString("id-ID", { month: "short", day: "numeric", year: "numeric" })}</td>
                <td className="px-5 py-4 font-light text-foreground">{input?.patient?.name || "Unknown Patient"}</td>
                <td className="px-5 py-4 text-sm font-light text-muted-foreground">{job.provider?.name || "-"}</td>
                <td className="px-5 py-4 text-right font-mono tabular-nums font-light text-foreground">{totalClaim ? new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(totalClaim) : "-"}</td>
                <td className="px-5 py-4 text-center">{statusBadge(job.status)}</td>
                <td className="px-5 py-4 text-right font-mono font-light text-foreground">{typeof score === "number" ? score : "-"}</td>
                <td className="px-5 py-4 text-right"><Link href={`/dashboard/clinical-pathway/${job.id}`} className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">View Results</Link></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <TablePagination total={filteredJobs.length} visible={paginatedJobs.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
    </div>
  );
}
