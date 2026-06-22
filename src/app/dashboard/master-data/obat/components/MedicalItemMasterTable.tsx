"use client";

import { useEffect, useState } from "react";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";
import { getMedicalItemMasterEntries } from "../actions";

type MedicalItemMasterEntry = {
  id: string;
  itemName: string;
  itemGenericName: string | null;
  itemTypeCode: string | null;
  itemTypeName: string | null;
  itemGroup: string | null;
  marketPriceMax: number;
  marketPriceAvg: number | null;
  fixPrice: number | null;
  hetPrice: number | null;
  maxReferencePrice: number | null;
  sources: unknown;
  currency: string;
  fetchedAt: Date | string;
  expiresAt: Date | string;
};

type SortField = "drug" | "maxPrice" | "avgPrice" | "fetchedAt" | "expiresAt" | "status";

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function isExpired(item: MedicalItemMasterEntry) {
  return toDate(item.expiresAt).getTime() <= Date.now();
}

function formatCurrency(value: number | null, currency: string) {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(toDate(value));
}

function normalizeSources(sources: unknown): string[] {
  if (Array.isArray(sources)) return sources.map(String).filter(Boolean);
  if (typeof sources === "string") return [sources];
  return [];
}

export default function MedicalItemMasterTable({ data, total = data.length, totalPages: initialTotalPages = 1 }: { data: MedicalItemMasterEntry[]; total?: number; totalPages?: number }) {
  const [rows, setRows] = useState<MedicalItemMasterEntry[]>(data);
  const [totalCount, setTotalCount] = useState(total);
  const [serverTotalPages, setServerTotalPages] = useState(Math.max(1, initialTotalPages));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("fetchedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const result = await getMedicalItemMasterEntries({ search, status: statusFilter, sortField, sortDirection, page, limit: pageSize });
        if (!cancelled) {
          setRows(result.entries as MedicalItemMasterEntry[]);
          setTotalCount(result.total);
          setServerTotalPages(result.totalPages);
        }
      } catch (error) {
        console.error("[medical-item/search]", error);
        if (!cancelled) {
          setRows([]);
          setTotalCount(0);
          setServerTotalPages(1);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, search.trim() ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, pageSize, search, sortDirection, sortField, statusFilter]);

  const currentPage = Math.min(page, serverTotalPages);
  const paginatedData = rows;

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 border-b border-border p-4 lg:grid-cols-[1fr_170px_120px] bg-background">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari nama item, generik, tipe, atau sumber..." />
        <select className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="expired">Kedaluwarsa</option>
        </select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20">
          {defaultPageSizes.map((size) => <option key={size} value={size}>{size} / halaman</option>)}
        </select>
      </div>

      {isLoading && <div className="border-b border-border px-5 py-3 text-xs font-light text-muted-foreground bg-background">Memuat data...</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-muted/40 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground border-b border-border">
            <tr>
              <th className="px-5 py-4"><SortButton field="drug" label="Item Farmalkes" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right"><SortButton field="maxPrice" label="Harga Validasi" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right"><SortButton field="avgPrice" label="Fix / HET / Max Ref" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4">Sumber</th>
              <th className="px-5 py-4"><SortButton field="fetchedAt" label="Diambil" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4"><SortButton field="expiresAt" label="Kedaluwarsa" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-center"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-light text-muted-foreground">Belum ada referensi harga farmalkes yang cocok.</td></tr>
            ) : paginatedData.map((item) => {
              const expired = isExpired(item);
              const sources = normalizeSources(item.sources);
              return (
                <tr key={item.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-5 py-4">
                    <p className="font-light text-foreground">{item.itemName}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 font-mono mt-1">{item.itemGenericName || "Nama generik belum tersedia"}</p>
                    <p className="mt-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{item.itemTypeName || item.itemTypeCode || "Tipe belum tersedia"} · {item.itemGroup || "group belum tersedia"}</p>
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums font-light text-foreground">{formatCurrency(item.marketPriceMax, item.currency)}</td>
                  <td className="px-5 py-4 text-right text-xs font-mono text-muted-foreground space-y-1">
                    <div>F <span className="text-foreground">{formatCurrency(item.fixPrice, item.currency)}</span></div>
                    <div>H <span className="text-foreground">{formatCurrency(item.hetPrice, item.currency)}</span></div>
                    <div>M <span className="text-foreground">{formatCurrency(item.maxReferencePrice ?? item.marketPriceMax, item.currency)}</span></div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex max-w-[260px] flex-wrap gap-1.5">
                      {sources.length === 0 ? <span className="text-xs font-mono text-muted-foreground">—</span> : sources.slice(0, 3).map((source) => (
                        <span key={source} className="max-w-[180px] truncate rounded-sm bg-muted border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground" title={source}>{source}</span>
                      ))}
                      {sources.length > 3 && <span className="rounded-sm bg-background border border-border px-2 py-0.5 text-[10px] font-light text-muted-foreground">+{sources.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">{formatDate(item.fetchedAt)}</td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">{formatDate(item.expiresAt)}</td>
                  <td className="px-5 py-4 text-center">
                    {expired ? <span className="rounded-sm bg-background px-2 py-0.5 text-[10px] font-light text-muted-foreground ring-1 ring-border uppercase tracking-widest">Kedaluwarsa</span> : <span className="rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 uppercase tracking-widest">Aktif</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePagination total={totalCount} visible={paginatedData.length} currentPage={currentPage} totalPages={serverTotalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(serverTotalPages, value + 1))} />
    </div>
  );
}
