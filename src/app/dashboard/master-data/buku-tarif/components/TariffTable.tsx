"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { deactivateTariffEntry } from "../actions";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";
import { formatTariffCategory, type TariffCategoryOption } from "../categories";

type SortField = "procedure" | "provider" | "category" | "basePrice" | "maxPrice" | "status";

function sortValue(item: any, field: SortField) {
  if (field === "procedure") return `${item.procedureCode || ""} ${item.procedureName || ""}`.toLowerCase();
  if (field === "provider") return String(item.provider?.name || "").toLowerCase();
  if (field === "basePrice") return Number(item.basePrice || 0);
  if (field === "maxPrice") return Number(item.maxPrice || 0);
  if (field === "status") return item.isActive ? 1 : 0;
  return String(item.category || "").toLowerCase();
}

type TariffTableProps = {
  data: any[]
  providers: any[]
  categories: TariffCategoryOption[]
  total?: number
  totalPages?: number
  currentPage?: number
}

export default function TariffTable({ data, providers, categories }: TariffTableProps) {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("procedure");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data
      .filter((item: any) => {
        const matchesSearch = !query || [item.procedureCode, item.procedureName, item.provider?.name, item.category, item.regionCode].some((value) => String(value || "").toLowerCase().includes(query));
        const matchesProvider = providerFilter === "all" || item.providerId === providerFilter;
        const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? item.isActive : !item.isActive);
        return matchesSearch && matchesProvider && matchesCategory && matchesStatus;
      })
      .sort((a: any, b: any) => {
        const aValue = sortValue(a, sortField);
        const bValue = sortValue(b, sortField);
        const result = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        return sortDirection === "asc" ? result : -result;
      });
  }, [categoryFilter, data, providerFilter, search, sortDirection, sortField, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  const handleDeactivate = async (id: string) => {
    if (confirm("Are you sure you want to deactivate this entry?")) await deactivateTariffEntry(id);
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 border-b border-border/60 p-4 lg:grid-cols-[1fr_220px_170px_150px_120px]">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search code, procedure, provider..." />
        <select className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm" value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }}>
          <option value="all">All Providers</option>{providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
          <option value="all">All Categories</option>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
        </select>
        <select className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">{defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle uppercase tracking-wider">
            <tr><th className="px-4 py-3"><SortButton field="procedure" label="Code & Procedure" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3"><SortButton field="provider" label="Provider" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3"><SortButton field="category" label="Category" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-right"><SortButton field="basePrice" label="Base Price" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-right"><SortButton field="maxPrice" label="Max Price" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-center"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {paginatedData.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-text-subtle">No fee records found.</td></tr> : paginatedData.map((item: any) => (
              <tr key={item.id} className="transition-colors hover:bg-surface-elevated/30">
                <td className="px-4 py-3"><p className="font-medium text-text">{item.procedureCode}</p><p className="text-xs text-text-subtle line-clamp-1">{item.procedureName}</p></td>
                <td className="px-4 py-3 text-text-subtle">{item.provider?.name || "Unknown"}</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-md bg-secondary-soft px-2 py-1 text-xs font-medium text-secondary ring-1 ring-inset ring-secondary/20">{formatTariffCategory(item.category)}</span></td>
                <td className="px-4 py-3 text-right font-medium text-text">{new Intl.NumberFormat("id-ID", { style: "currency", currency: item.currency }).format(item.basePrice)}</td>
                <td className="px-4 py-3 text-right font-medium text-text">{new Intl.NumberFormat("id-ID", { style: "currency", currency: item.currency }).format(item.maxPrice)}</td>
                <td className="px-4 py-3 text-center">{item.isActive ? <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-700">Active</span> : <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-700">Inactive</span>}</td>
                <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-2"><Link href={`/dashboard/master-data/buku-tarif/${item.id}`} className="rounded-md border border-border px-2.5 py-2 text-xs font-semibold text-text-subtle hover:bg-surface-elevated">Edit</Link>{item.isActive && <button onClick={() => handleDeactivate(item.id)} className="rounded-md border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Deactivate</button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination total={filteredData.length} visible={paginatedData.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
    </div>
  );
}
