"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";

interface ProviderData {
  name: string;
}

interface OcrJobData {
  id: string;
  status: string;
  snaptextStatus: string;
  matchScore: number | null;
  createdAt: string;
  errorMessage: string | null;
  provider: ProviderData | null;
}

type SortField = "createdAt" | "provider" | "status" | "matchScore";

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function compareValues(a: string | number, b: string | number, direction: SortDirection) {
  const result = a > b ? 1 : a < b ? -1 : 0;
  return direction === "asc" ? result : -result;
}

export default function OcrJobsList() {
  const [jobs, setJobs] = useState<OcrJobData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isBulkForwarding, setIsBulkForwarding] = useState(false);
  const [bulkForwardMessage, setBulkForwardMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await fetch("/api/v1/ocr/jobs");
        if (!res.ok) throw new Error("Gagal mengambil data");
        const data = await res.json();
        setJobs(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      } finally {
        setIsLoading(false);
      }
    };
    void fetchJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs
      .filter((job) => {
        const providerName = job.provider?.name || "Unknown Provider";
        const matchesSearch = !query || [job.id, providerName, job.status].some((val) => val.toLowerCase().includes(query));
        return matchesSearch;
      })
      .sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        if (sortField === "createdAt") {
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
        } else if (sortField === "provider") {
          aValue = a.provider?.name || "";
          bValue = b.provider?.name || "";
        } else if (sortField === "matchScore") {
          aValue = a.matchScore ?? -1;
          bValue = b.matchScore ?? -1;
        } else {
          aValue = a[sortField] || "";
          bValue = b[sortField] || "";
        }

        return compareValues(aValue, bValue, sortDirection);
      });
  }, [jobs, search, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const forwardableJobs = paginatedJobs.filter((job) => job.status === "APPROVED" && job.matchScore === 100);
  const allForwardableSelected = forwardableJobs.length > 0 && forwardableJobs.every((job) => selectedJobIds.has(job.id));

  function handleSelectAll() {
    if (allForwardableSelected) {
      const newSelected = new Set(selectedJobIds);
      forwardableJobs.forEach((job) => newSelected.delete(job.id));
      setSelectedJobIds(newSelected);
    } else {
      const newSelected = new Set(selectedJobIds);
      forwardableJobs.forEach((job) => newSelected.add(job.id));
      setSelectedJobIds(newSelected);
    }
  }

  function handleSelectRow(id: string) {
    const newSelected = new Set(selectedJobIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedJobIds(newSelected);
  }

  async function handleBulkForward() {
    if (selectedJobIds.size === 0) return;
    
    setIsBulkForwarding(true);
    setBulkForwardMessage(null);
    setError(null);
    
    try {
      const res = await fetch("/api/v1/ocr/forward/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrJobIds: Array.from(selectedJobIds) }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Gagal melakukan forward massal");
      
      setBulkForwardMessage(`Berhasil: ${data.summary.success}, Gagal: ${data.summary.failed}`);
      setSelectedJobIds(new Set());
      
      // Refresh list
      const jobsRes = await fetch("/api/v1/ocr/jobs");
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memproses bulk forward");
    } finally {
      setIsBulkForwarding(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "APPROVED":
      case "FORWARDED":
        return <span className="inline-flex items-center rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">Selesai</span>;
      case "REVIEW_NEEDED":
        return <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Perlu Review</span>;
      case "FAILED":
        return <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">Gagal</span>;
      default:
        return <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">Diproses</span>;
    }
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Memuat data riwayat OCR...</div>;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {bulkForwardMessage && <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700">{bulkForwardMessage}</div>}
      
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
          <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari ID, provider, atau status..." />
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm">
            {defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </div>
        
        {selectedJobIds.size > 0 && (
          <button
            type="button"
            onClick={handleBulkForward}
            disabled={isBulkForwarding}
            className="inline-flex items-center rounded-md bg-sky-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:opacity-50"
          >
            {isBulkForwarding ? "Memproses..." : `Jalankan Validasi Klaim Massal (${selectedJobIds.size})`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium w-10">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-300 text-sky-700 focus:ring-sky-600"
                  checked={allForwardableSelected}
                  onChange={handleSelectAll}
                  disabled={forwardableJobs.length === 0}
                />
              </th>
              <th className="px-4 py-3 font-medium">
                <SortButton field="createdAt" label="Waktu" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 font-medium">
                <SortButton field="provider" label="Provider" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 font-medium">
                <SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 font-medium text-right">
                <SortButton field="matchScore" label="Skor Kesesuaian" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedJobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Tidak ada riwayat OCR yang ditemukan.</td>
              </tr>
            ) : (
              paginatedJobs.map((job) => {
                const canForward = job.status === "APPROVED" && job.matchScore === 100;
                return (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {canForward && (
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-sky-700 focus:ring-sky-600"
                          checked={selectedJobIds.has(job.id)}
                          onChange={() => handleSelectRow(job.id)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(job.createdAt)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{job.provider?.name || <span className="italic text-slate-400">Tidak diketahui</span>}</td>
                  <td className="px-4 py-3">{getStatusBadge(job.status)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">{job.matchScore != null ? `${job.matchScore}%` : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/clinical-pathway/ocr-import/${job.id}`}
                      className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                    >
                      Buka Review
                    </Link>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
      
      <TablePagination 
        total={filteredJobs.length} 
        visible={paginatedJobs.length} 
        currentPage={currentPage} 
        totalPages={totalPages} 
        onPrev={() => setPage((value) => Math.max(1, value - 1))} 
        onNext={() => setPage((value) => Math.min(totalPages, value + 1))} 
      />
    </div>
  );
}
