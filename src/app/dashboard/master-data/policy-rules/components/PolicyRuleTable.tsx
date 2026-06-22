"use client";

import { useEffect, useState } from "react";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";
import { getPolicyRules, deletePolicyRule } from "../actions";
import Link from "next/link";
import { PencilLine, Trash2 } from "lucide-react";

type PolicyRuleEntry = {
  id: string;
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  targetType: string | null;
  targetCode: string | null;
  targetPattern: string | null;
  severity: string;
  status: string;
  updatedAt: Date | string;
  clientId: string | null;
  client?: { name: string; code: string } | null;
  conditionJson?: any;
  actionJson?: any;
  recommendation?: string | null;
};

type SortField = "ruleCode" | "ruleName" | "ruleType" | "status" | "updatedAt";

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(value instanceof Date ? value : new Date(value));
}

export default function PolicyRuleTable({ data, total = data.length, totalPages: initialTotalPages = 1 }: { data: PolicyRuleEntry[]; total?: number; totalPages?: number }) {
  const [rows, setRows] = useState<PolicyRuleEntry[]>(data);
  const [totalCount, setTotalCount] = useState(total);
  const [serverTotalPages, setServerTotalPages] = useState(Math.max(1, initialTotalPages));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  


  const fetchRules = async () => {
    setIsLoading(true);
    try {
      const result = await getPolicyRules({ search, status: statusFilter, ruleType: typeFilter, sortField, sortDirection, page, limit: pageSize });
      setRows(result.entries as PolicyRuleEntry[]);
      setTotalCount(result.total);
      setServerTotalPages(result.totalPages);
    } catch (error) {
      console.error("[policy-rules/search]", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) fetchRules();
    }, search.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, pageSize, search, sortDirection, sortField, statusFilter, typeFilter]);

  const currentPage = Math.min(page, serverTotalPages);
  const paginatedData = rows;

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  // handleDelete is now handled by the confirmation modal

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 border-b border-border p-4 lg:grid-cols-[1fr_150px_150px_150px_120px] bg-background">
        <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari kode atau nama rule..." />
        <select className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}>
          <option value="all">Semua Tipe</option>
          <option value="EXCLUSION">Exclusion</option>
          <option value="LIMIT">Limit</option>
          <option value="DEDUCTIBLE">Deductible</option>
          <option value="COPAY">Co-Pay</option>
          <option value="ROOM_ENTITLEMENT">Hak Kamar</option>
        </select>
        <select className="rounded-md border border-border bg-background px-3 py-2.5 text-sm font-light text-foreground outline-none focus:ring-2 focus:ring-primary/20" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
          <option value="all">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Nonaktif</option>
          <option value="ARCHIVED">Diarsipkan</option>
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
              <th className="px-5 py-4"><SortButton field="ruleCode" label="Rule Code / Name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4"><SortButton field="ruleType" label="Tipe Rule" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4">Target Kondisi</th>
              <th className="px-5 py-4">Severity</th>
              <th className="px-5 py-4"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4"><SortButton field="updatedAt" label="Terakhir Diubah" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-5 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-light text-muted-foreground">Belum ada policy rules yang terdaftar.</td></tr>
            ) : paginatedData.map((item) => (
                <tr key={item.id} className="group transition-colors hover:bg-muted/50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-foreground">{item.ruleCode}</p>
                    <p className="text-[12px] text-muted-foreground line-clamp-1 mt-1">{item.ruleName}</p>
                    {item.client && <p className="text-[10px] uppercase font-mono tracking-widest text-emerald-600 mt-1">{item.client.name}</p>}
                    {!item.clientId && <p className="text-[10px] uppercase font-mono tracking-widest text-blue-600 mt-1">GLOBAL RULE</p>}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-sm bg-muted border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-foreground">{item.ruleType}</span>
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">
                    {item.targetType ? <div><span className="font-medium text-foreground">{item.targetType}</span> : {item.targetCode || item.targetPattern || '-'}</div> : <span>—</span>}
                  </td>
                  <td className="px-5 py-4">
                     <span className={`text-[11px] font-medium px-2 py-1 rounded ${item.severity === 'REJECT_RECOMMENDED' ? 'bg-red-50 text-red-700' : item.severity === 'REVIEW_NEEDED' ? 'bg-amber-50 text-amber-700' : item.severity === 'WARNING' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>{item.severity}</span>
                  </td>
                  <td className="px-5 py-4">
                    {item.status === 'ACTIVE' ? <span className="rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 uppercase tracking-widest">Aktif</span> : <span className="rounded-sm bg-background px-2 py-0.5 text-[10px] font-light text-muted-foreground ring-1 ring-border uppercase tracking-widest">{item.status}</span>}
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">{formatDate(item.updatedAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 transition-opacity">
                      <Link 
                        href={`/dashboard/master-data/policy-rules/${item.id}/edit`} 
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-blue-50 hover:text-blue-600 transition-colors focus:outline-none"
                        title="Edit Rule"
                      >
                        <PencilLine className="h-4 w-4" />
                      </Link>
                      <button 
                        onClick={() => setDeleteConfirmId(item.id)} 
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors focus:outline-none"
                        title="Hapus Rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination total={totalCount} visible={paginatedData.length} currentPage={currentPage} totalPages={serverTotalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(serverTotalPages, value + 1))} />
      
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card p-6 shadow-xl border border-border animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-foreground">Hapus Policy Rule</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Apakah Anda yakin ingin menghapus rule ini secara permanen? Data yang telah dihapus tidak dapat dikembalikan.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-muted border border-transparent hover:border-border transition-colors"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  try {
                    await deletePolicyRule(deleteConfirmId);
                    fetchRules();
                  } catch (e) {
                    alert("Gagal menghapus rule. Pastikan Anda memiliki hak akses.");
                  } finally {
                    setDeleteConfirmId(null);
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors"
              >
                Ya, Hapus Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
