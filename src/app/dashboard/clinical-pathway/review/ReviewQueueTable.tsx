"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileWarning, ShieldAlert } from "lucide-react";

import { REVIEW_DECISION_LABELS, REVIEW_STATUS_LABELS, type ReviewDecisionValue, type ReviewStatusValue } from "@/lib/hitl";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";
import type { ReviewQueueItem, ReviewQueueSummary } from "./actions";

type SortField = "sla" | "claim" | "provider" | "score" | "policyExcess" | "findings" | "reviewStatus";
type ReviewStatusFilter = "active" | "all" | ReviewStatusValue;

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatSla(hours: number): string {
  if (hours < 24) return `${hours} jam`;
  return `${Math.floor(hours / 24)} hari ${hours % 24} jam`;
}

function reviewStatusBadge(status: string) {
  if (status === "DECIDED") return <span className="inline-flex rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-green-700 ring-1 ring-inset ring-green-500/20">Diputuskan</span>;
  if (status === "WAITING_DOCUMENTS") return <span className="inline-flex rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-blue-700 ring-1 ring-inset ring-blue-500/20">Dokumen</span>;
  if (status === "ESCALATED") return <span className="inline-flex rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-red-700 ring-1 ring-inset ring-red-500/20">Eskalasi</span>;
  return <span className="inline-flex rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-amber-700 ring-1 ring-inset ring-amber-500/20">Menunggu</span>;
}

function validationStatusBadge(status: string) {
  if (status === "REVIEW_NEEDED") return <span className="inline-flex rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-red-700 ring-1 ring-inset ring-red-500/20">Review</span>;
  if (status === "WARNING") return <span className="inline-flex rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-amber-700 ring-1 ring-inset ring-amber-500/20">Warning</span>;
  return <span className="inline-flex rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-green-700 ring-1 ring-inset ring-green-500/20">Valid</span>;
}

function sortValue(item: ReviewQueueItem, field: SortField): string | number {
  if (field === "sla") return item.slaAgeHours;
  if (field === "claim") return item.claimId.toLowerCase();
  if (field === "provider") return item.providerName.toLowerCase();
  if (field === "score") return item.score ?? 0;
  if (field === "policyExcess") return item.policyExcessAmount;
  if (field === "findings") return item.findingCount;
  return item.reviewStatus.toLowerCase();
}

function SummaryCard({ label, value, helper, icon }: { label: string; value: string | number; helper: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-2xl font-light text-foreground">{value}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-2 text-muted-foreground">{icon}</div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function ReviewQueueTable({ items, summary }: { items: ReviewQueueItem[]; summary: ReviewQueueSummary }) {
  const [search, setSearch] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatusFilter>("active");
  const [sortField, setSortField] = useState<SortField>("sla");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => {
        const matchesSearch = !query || [item.claimId, item.patientName, item.providerName, item.validationStatus, item.reviewStatus].some((value) => value.toLowerCase().includes(query));
        const matchesStatus = reviewStatus === "all" || (reviewStatus === "active" ? item.reviewStatus !== "DECIDED" : item.reviewStatus === reviewStatus);
        return matchesSearch && matchesStatus;
      })
      .sort((first, second) => {
        const firstValue = sortValue(first, sortField);
        const secondValue = sortValue(second, sortField);
        const result = firstValue > secondValue ? 1 : firstValue < secondValue ? -1 : 0;
        return sortDirection === "asc" ? result : -result;
      });
  }, [items, reviewStatus, search, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(field: SortField): void {
    if (sortField === field) setSortDirection((value) => value === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Open" value={summary.open} helper="Klaim yang belum memiliki keputusan reviewer." icon={<Clock3 className="h-4 w-4" />} />
        <SummaryCard label="Dokumen" value={summary.waitingDocuments} helper="Klaim menunggu dokumen tambahan." icon={<FileWarning className="h-4 w-4" />} />
        <SummaryCard label="Eskalasi" value={summary.escalated} helper="Klaim yang perlu medical advisor." icon={<ShieldAlert className="h-4 w-4" />} />
        <SummaryCard label="Excess Polis" value={formatRupiah(summary.totalPolicyExcess)} helper="Akumulasi estimasi excess dari policy engine." icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid grid-cols-1 gap-3 border-b border-border bg-background p-4 lg:grid-cols-[1fr_220px_140px]">
          <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari claim ID, pasien, provider, status..." />
          <select value={reviewStatus} onChange={(event) => { setReviewStatus(event.target.value as ReviewStatusFilter); setPage(1); }} className="rounded-md border border-border bg-background px-3 py-2.5 text-base font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm">
            <option value="active">Perlu diproses</option>
            <option value="all">Semua status review</option>
            <option value="OPEN">Menunggu review</option>
            <option value="WAITING_DOCUMENTS">Menunggu dokumen</option>
            <option value="ESCALATED">Eskalasi</option>
            <option value="DECIDED">Sudah diputuskan</option>
          </select>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-background px-3 py-2.5 text-base font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm">
            {defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="px-5 py-4"><SortButton field="sla" label="SLA" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-5 py-4"><SortButton field="claim" label="Claim" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-5 py-4"><SortButton field="provider" label="Provider" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-5 py-4 text-right"><SortButton field="score" label="Score" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-5 py-4 text-right"><SortButton field="policyExcess" label="Policy Excess" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-5 py-4 text-center"><SortButton field="findings" label="Flags" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-5 py-4 text-center">Validasi</th>
                <th className="px-5 py-4 text-center"><SortButton field="reviewStatus" label="Review" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-5 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm font-light text-muted-foreground">Tidak ada klaim yang sesuai filter review.</td>
                </tr>
              ) : paginatedItems.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{formatSla(item.slaAgeHours)}</td>
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs text-foreground">{item.claimId}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.patientName}</p>
                  </td>
                  <td className="px-5 py-4 text-sm font-light text-muted-foreground">{item.providerName}</td>
                  <td className="px-5 py-4 text-right font-mono text-sm font-light text-foreground">{typeof item.score === "number" ? item.score : "-"}</td>
                  <td className="px-5 py-4 text-right font-mono text-sm font-light text-foreground">{formatRupiah(item.policyExcessAmount)}</td>
                  <td className="px-5 py-4 text-center">
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {item.findingCount > 0 ? <AlertTriangle className="h-3 w-3 text-amber-600" /> : <CheckCircle2 className="h-3 w-3 text-green-600" />}
                      {item.findingCount}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">{validationStatusBadge(item.validationStatus)}</td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {reviewStatusBadge(item.reviewStatus)}
                      <span className="text-[10px] text-muted-foreground">{item.latestDecision ? REVIEW_DECISION_LABELS[item.latestDecision as ReviewDecisionValue] || item.latestDecision : REVIEW_STATUS_LABELS[item.reviewStatus as ReviewStatusValue] || item.reviewStatus}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <Link href={`/dashboard/clinical-pathway/review/${item.id}`} className="inline-flex min-h-9 items-center justify-center whitespace-nowrap text-center rounded-md bg-foreground px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-background shadow-sm transition-colors hover:bg-foreground/90 focus:outline-none">
                      Buka Workbench
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination total={filteredItems.length} visible={paginatedItems.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
      </div>
    </div>
  );
}
