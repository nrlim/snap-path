"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  deactivateTariffEntry,
  getTariffEntries,
  type TariffSortDirection,
  type TariffSortField,
} from "../actions";
import { defaultPageSizes, SortButton, TablePagination, TableSearch } from "@/components/ui/DataTableControls";
import { formatTariffCategory, type TariffCategoryOption } from "../categories";

type TariffRow = {
  id: string;
  providerId: string;
  procedureCode: string;
  procedureName: string;
  category: string;
  regionCode?: string | null;
  basePrice: number;
  maxPrice: number;
  currency: string;
  isActive: boolean;
  provider?: { name: string } | null;
};

type ProviderOption = {
  id: string;
  name: string;
};

type TariffTableProps = {
  data: TariffRow[];
  providers: ProviderOption[];
  categories: TariffCategoryOption[];
  total?: number;
  totalPages?: number;
  currentPage?: number;
};

export default function TariffTable({ data, providers, categories, total = data.length, totalPages: initialTotalPages = 1, currentPage = 1 }: TariffTableProps) {
  const [rows, setRows] = useState<TariffRow[]>(data);
  const [totalCount, setTotalCount] = useState(total);
  const [serverTotalPages, setServerTotalPages] = useState(Math.max(1, initialTotalPages));
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortField, setSortField] = useState<TariffSortField>("procedure");
  const [sortDirection, setSortDirection] = useState<TariffSortDirection>("asc");
  const [page, setPage] = useState(currentPage);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const debounceMs = search.trim() ? 250 : 0;

    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const result = await getTariffEntries({
          search,
          providerId: providerFilter,
          category: categoryFilter,
          status: statusFilter,
          sortField,
          sortDirection,
          page,
          limit: pageSize,
        });

        if (!cancelled) {
          setRows(result.entries as TariffRow[]);
          setTotalCount(result.total);
          setServerTotalPages(result.totalPages);
        }
      } catch (error) {
        console.error("[tariff-table/search]", { message: error instanceof Error ? error.message : "Unknown" });
        if (!cancelled) {
          setRows([]);
          setTotalCount(0);
          setServerTotalPages(1);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [categoryFilter, page, pageSize, providerFilter, search, sortDirection, sortField, statusFilter]);

  function handleSort(field: TariffSortField) {
    setPage(1);
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  const handleDeactivate = async (id: string) => {
    if (!confirm("Nonaktifkan data tarif ini?")) return;
    const result = await deactivateTariffEntry(id);
    if (result.success) {
      setRows((currentRows) => currentRows.map((item) => (item.id === id ? { ...item, isActive: false } : item)));
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 border-b border-border p-4 lg:grid-cols-[1fr_220px_170px_150px_120px] bg-background">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari kode, prosedur, provider..." />
        <select className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20" value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }}>
          <option value="all">Semua Provider</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
          <option value="all">Semua Kategori</option>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
        </select>
        <select className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as "all" | "active" | "inactive"); setPage(1); }}>
          <option value="all">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option>
        </select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20">{defaultPageSizes.map((size) => <option key={size} value={size}>{size} / halaman</option>)}</select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-muted/40 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground border-b border-border">
            <tr>
              <th className="px-5 py-4"><SortButton field="procedure" label="Prosedur & Kode" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4"><SortButton field="provider" label="Provider" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4"><SortButton field="category" label="Kategori" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right"><SortButton field="basePrice" label="Harga Dasar" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right"><SortButton field="maxPrice" label="Harga Maks" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-center"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-light text-muted-foreground">Memuat data...</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-light text-muted-foreground">Data tarif tidak ditemukan.</td></tr> : rows.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-muted/50">
                <td className="px-5 py-4"><p className="font-light text-foreground line-clamp-1">{item.procedureName}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.procedureCode}</p></td>
                <td className="px-5 py-4 text-muted-foreground text-sm font-medium">{item.provider?.name || "Unknown"}</td>
                <td className="px-5 py-4"><span className="inline-flex items-center rounded-sm bg-muted px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground border border-border">{formatTariffCategory(item.category)}</span></td>
                <td className="px-5 py-4 text-right font-mono tabular-nums font-light text-foreground">{new Intl.NumberFormat("id-ID", { style: "currency", currency: item.currency, maximumFractionDigits: 0 }).format(item.basePrice)}</td>
                <td className="px-5 py-4 text-right font-mono tabular-nums font-light text-foreground">{new Intl.NumberFormat("id-ID", { style: "currency", currency: item.currency, maximumFractionDigits: 0 }).format(item.maxPrice)}</td>
                <td className="px-5 py-4 text-center">{item.isActive ? <span className="rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 uppercase tracking-widest">Aktif</span> : <span className="rounded-sm bg-background px-2 py-0.5 text-[10px] font-light text-muted-foreground ring-1 ring-border uppercase tracking-widest">Nonaktif</span>}</td>
                <td className="px-5 py-4 text-right"><div className="flex items-center justify-end gap-2"><Link href={`/dashboard/master-data/buku-tarif/${item.id}`} className="rounded-md border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Edit</Link>{item.isActive && <button onClick={() => handleDeactivate(item.id)} className="rounded-md border border-red-200 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-red-600 hover:bg-red-50 transition-colors">Nonaktif</button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination total={totalCount} visible={rows.length} currentPage={page} totalPages={serverTotalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(serverTotalPages, value + 1))} />
    </div>
  );
}
