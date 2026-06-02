"use client";

import { useMemo, useState } from "react";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";

type DrugPriceCacheEntry = {
  id: string;
  itemName: string;
  itemGenericName: string | null;
  itemTypeCode: string | null;
  itemTypeName: string | null;
  itemGroup: string | null;
  marketPriceMax: number;
  marketPriceAvg: number | null;
  sources: unknown;
  currency: string;
  fetchedAt: Date | string;
  expiresAt: Date | string;
};

type SortField = "drug" | "maxPrice" | "avgPrice" | "fetchedAt" | "expiresAt" | "status";

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function isExpired(item: DrugPriceCacheEntry) {
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

function sortValue(item: DrugPriceCacheEntry, field: SortField) {
  if (field === "drug") return `${item.itemName || ""} ${item.itemGenericName || ""} ${item.itemTypeName || ""} ${item.itemGroup || ""}`.toLowerCase();
  if (field === "maxPrice") return Number(item.marketPriceMax || 0);
  if (field === "avgPrice") return Number(item.marketPriceAvg || 0);
  if (field === "fetchedAt") return toDate(item.fetchedAt).getTime();
  if (field === "expiresAt") return toDate(item.expiresAt).getTime();
  return isExpired(item) ? 0 : 1;
}

export default function DrugPriceCacheTable({ data }: { data: DrugPriceCacheEntry[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("fetchedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data
      .filter((item) => {
        const sources = normalizeSources(item.sources).join(" ");
        const matchesSearch = !query || [item.itemName, item.itemGenericName, item.itemTypeName, item.itemGroup, sources].some((value) => String(value || "").toLowerCase().includes(query));
        const expired = isExpired(item);
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? !expired : expired);
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const aValue = sortValue(a, sortField);
        const bValue = sortValue(b, sortField);
        const result = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        return sortDirection === "asc" ? result : -result;
      });
  }, [data, search, sortDirection, sortField, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 border-b border-border/60 p-4 lg:grid-cols-[1fr_170px_120px]">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari nama item, generik, tipe, atau sumber..." />
        <select className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="expired">Kedaluwarsa</option>
        </select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">
          {defaultPageSizes.map((size) => <option key={size} value={size}>{size} / halaman</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold uppercase tracking-wider text-text-subtle">
            <tr>
              <th className="px-4 py-3"><SortButton field="drug" label="Item Farmalkes" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortButton field="maxPrice" label="Harga Maks" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortButton field="avgPrice" label="Harga Rata-rata" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3">Sumber</th>
              <th className="px-4 py-3"><SortButton field="fetchedAt" label="Diambil" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortButton field="expiresAt" label="Kedaluwarsa" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-center"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {paginatedData.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-text-subtle">Belum ada referensi harga farmalkes yang cocok.</td></tr>
            ) : paginatedData.map((item) => {
              const expired = isExpired(item);
              const sources = normalizeSources(item.sources);
              return (
                <tr key={item.id} className="transition-colors hover:bg-surface-elevated/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{item.itemName}</p>
                    <p className="text-xs text-text-subtle line-clamp-1">{item.itemGenericName || "Nama generik belum tersedia"}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">{item.itemTypeName || item.itemTypeCode || "Tipe belum tersedia"} · {item.itemGroup || "group belum tersedia"}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text">{formatCurrency(item.marketPriceMax, item.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium text-text-subtle">{formatCurrency(item.marketPriceAvg, item.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-[260px] flex-wrap gap-1.5">
                      {sources.length === 0 ? <span className="text-xs text-text-faint">—</span> : sources.slice(0, 3).map((source) => (
                        <span key={source} className="max-w-[180px] truncate rounded-md bg-secondary-soft px-2 py-1 text-xs font-medium text-secondary ring-1 ring-inset ring-secondary/20" title={source}>{source}</span>
                      ))}
                      {sources.length > 3 && <span className="rounded-md bg-surface-elevated px-2 py-1 text-xs font-medium text-text-subtle">+{sources.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-subtle">{formatDate(item.fetchedAt)}</td>
                  <td className="px-4 py-3 text-text-subtle">{formatDate(item.expiresAt)}</td>
                  <td className="px-4 py-3 text-center">
                    {expired ? <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700">Kedaluwarsa</span> : <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-700">Aktif</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePagination total={filteredData.length} visible={paginatedData.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
    </div>
  );
}
