"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { deactivateTariffEntry } from "../actions";

export default function TariffTable({ data, total, totalPages, currentPage, providers }: any) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1"); // Reset to page 1
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDeactivate = async (id: string) => {
    if (confirm("Are you sure you want to deactivate this entry?")) {
      await deactivateTariffEntry(id);
    }
  };

  const currentProvider = searchParams.get("providerId") || "";
  const currentCategory = searchParams.get("category") || "";

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row border-b border-border/60 bg-surface-elevated/50">
        <select 
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          value={currentProvider}
          onChange={(e) => handleFilterChange("providerId", e.target.value)}
        >
          <option value="">All Providers</option>
          {providers.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        
        <select 
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          value={currentCategory}
          onChange={(e) => handleFilterChange("category", e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="RAWAT_INAP">Inpatient</option>
          <option value="RAWAT_JALAN">Outpatient</option>
          <option value="IGD">ER</option>
          <option value="OBAT">Pharmacy</option>
          <option value="LAB">Laboratory</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Code & Procedure</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Base Price</th>
              <th className="px-4 py-3 text-right">Max Price</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-subtle">
                  No fee records found.
                </td>
              </tr>
            ) : (
              data.map((item: any) => (
                <tr key={item.id} className="transition-colors hover:bg-surface-elevated/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{item.procedureCode}</p>
                    <p className="text-xs text-text-subtle line-clamp-1">{item.procedureName}</p>
                  </td>
                  <td className="px-4 py-3 text-text-subtle">{item.provider?.name || "Unknown"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-secondary-soft px-2 py-1 text-xs font-medium text-secondary ring-1 ring-inset ring-secondary/20">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: item.currency }).format(item.basePrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: item.currency }).format(item.maxPrice)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.isActive ? (
                      <span className="inline-flex h-2 w-2 rounded-full bg-green-500 ring-2 ring-green-500/20" title="Active"></span>
                    ) : (
                      <span className="inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-red-500/20" title="Inactive"></span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link 
                        href={`/dashboard/master-data/buku-tarif/${item.id}`}
                        className="p-1.5 text-text-subtle hover:text-primary transition-colors rounded-md hover:bg-primary-soft"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </Link>
                      {item.isActive && (
                        <button 
                          onClick={() => handleDeactivate(item.id)}
                          className="p-1.5 text-text-subtle hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
                          title="Deactivate"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 p-4">
          <p className="text-sm text-text-subtle">
            Showing page <span className="font-medium text-text">{currentPage}</span> of <span className="font-medium text-text">{totalPages}</span> ({total} total records)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleFilterChange("page", (currentPage - 1).toString())}
              disabled={currentPage <= 1}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => handleFilterChange("page", (currentPage + 1).toString())}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
