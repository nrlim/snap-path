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
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 border-b border-border pb-4 lg:grid-cols-[1fr_120px]">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari ID, provider, atau status..." />
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm">
          {defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
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
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Tidak ada riwayat OCR yang ditemukan.</td>
              </tr>
            ) : (
              paginatedJobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50">
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
              ))
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
