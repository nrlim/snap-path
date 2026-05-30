"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { topUpClientCredit } from "./actions";
import { useUI } from "@/components/providers/UIProvider";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";

type Ledger = { id: string; amount: number; balanceAfter: number; type: string; description: string | null; jobId: string | null; createdAt: Date | string };
type ClientCredit = { id: string; code: string; name: string; isActive: boolean; creditBalance: number; creditLedgers: Ledger[] };
type SortField = "name" | "code" | "creditBalance" | "status";

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatCredit(value: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

function sortValue(client: ClientCredit, field: SortField) {
  if (field === "creditBalance") return client.creditBalance;
  if (field === "status") return client.isActive ? 1 : 0;
  return String(client[field]).toLowerCase();
}

export default function CreditClient({ clients, canTopUp }: { clients: ClientCredit[]; canTopUp: boolean }) {
  const router = useRouter();
  const { showNotification } = useUI();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [topUpClient, setTopUpClient] = useState<ClientCredit | null>(null);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients
      .filter((client) => !query || [client.name, client.code].some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => {
        const aValue = sortValue(a, sortField);
        const bValue = sortValue(b, sortField);
        const result = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        return sortDirection === "asc" ? result : -result;
      });
  }, [clients, search, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedClients = filteredClients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  function submitTopUp(formData: FormData) {
    startTransition(async () => {
      const result = await topUpClientCredit(formData);
      if (result.success) {
        setTopUpClient(null);
        router.refresh();
      }
      showNotification({ type: result.success ? "success" : "error", title: result.success ? "Credit ditambahkan" : "Gagal", message: result.success ? "Saldo credit client berhasil diperbarui." : result.error || "Gagal top up credit." });
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-text-faint">Total client</p>
          <p className="mt-2 text-2xl font-bold text-text">{clients.length}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-text-faint">Total credit aktif</p>
          <p className="mt-2 text-2xl font-bold text-primary">${formatCredit(clients.reduce((sum, client) => sum + client.creditBalance, 0))}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-text-faint">Aturan penggunaan</p>
          <p className="mt-2 text-sm leading-6 text-text-subtle">Credit adalah saldo virtual USD dan berkurang sesuai estimasi pemakaian AI setiap request.</p>
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-surface shadow-sm">
        <div className="grid grid-cols-1 gap-3 border-b border-border/60 p-4 sm:grid-cols-[1fr_140px]">
          <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari client atau kode..." />
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">{defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-surface-elevated/50 text-xs uppercase tracking-wider text-text-subtle">
              <tr>
                <th className="px-4 py-3"><SortButton field="name" label="Client" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortButton field="code" label="Code" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3 text-right"><SortButton field="creditBalance" label="Credit" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3">Transaksi terakhir</th>
                {canTopUp && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paginatedClients.length === 0 ? <tr><td colSpan={canTopUp ? 6 : 5} className="px-4 py-10 text-center text-text-subtle">Tidak ada client.</td></tr> : paginatedClients.map((client) => {
                const latest = client.creditLedgers[0];
                return (
                  <tr key={client.id} className="hover:bg-surface-elevated/30">
                    <td className="px-4 py-3"><p className="font-bold text-text">{client.name}</p><p className="text-xs text-text-subtle">{client.creditLedgers.length} transaksi terbaru tersimpan</p></td>
                    <td className="px-4 py-3 font-mono text-xs text-text-subtle">{client.code}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${client.isActive ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>{client.isActive ? "Active" : "Inactive"}</span></td>
                    <td className="px-4 py-3 text-right text-xl font-bold tabular-nums text-primary">${formatCredit(client.creditBalance)}</td>
                    <td className="px-4 py-3 text-text-subtle">{latest ? <div><p className={latest.amount > 0 ? "font-semibold text-green-700" : "font-semibold text-orange-700"}>{latest.amount > 0 ? "+" : "-"}${formatCredit(Math.abs(latest.amount))} · {latest.type}</p><p className="mt-0.5 text-xs">{formatDate(latest.createdAt)}</p></div> : "Belum ada transaksi"}</td>
                    {canTopUp && <td className="px-4 py-3 text-right"><button type="button" onClick={() => setTopUpClient(client)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover"><Plus className="h-3.5 w-3.5" /> Top up</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination total={filteredClients.length} visible={paginatedClients.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
      </section>

      {topUpClient && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <form action={submitTopUp} className="w-full max-w-lg overflow-hidden rounded-[24px] border border-border/80 bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><h3 className="text-base font-bold text-text">Top up credit</h3><p className="text-sm text-text-subtle">Client: {topUpClient.name}</p></div><button type="button" onClick={() => setTopUpClient(null)} className="rounded-md p-2 text-text-subtle hover:bg-surface-elevated"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-4 p-5">
              <input type="hidden" name="clientId" value={topUpClient.id} />
              <label className="text-sm font-medium text-text">Jumlah credit USD<input name="amount" type="number" min="0.01" step="0.01" required className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm" placeholder="5.00" /></label>
              <label className="text-sm font-medium text-text">Catatan<input name="description" className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm" placeholder="Pembelian paket credit manual" /></label>
            </div>
            <div className="flex justify-end gap-3 border-t border-border/60 px-5 py-4"><button type="button" onClick={() => setTopUpClient(null)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-subtle hover:bg-surface-elevated">Batal</button><button disabled={isPending} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Tambah credit</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
