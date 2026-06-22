"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, Edit3, KeyRound, Plus, Trash2, X } from "lucide-react";
import { assignTariffProviderToClient, createClientApiCredential, deleteClient, setClientApiKeyStatus, upsertClient } from "./actions";
import { useUI } from "@/components/providers/UIProvider";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";

type Client = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  aiProvider: string | null;
  aiGatewayUrl: string | null;
  aiModel: string | null;
  aiMaxTokens: number | null;
  aiTemperature: number | null;
  apiKeys: Array<{ id: string; name: string; isActive: boolean; expiresAt: Date | string | null; createdAt: Date | string; apiKey?: string | null; apiSecret?: string | null }>;
  providers: Array<{ id: string; code: string; name: string; isActive: boolean; _count?: { tariffBook: number } }>;
};

type AssignableProvider = { id: string; code: string; name: string; isActive: boolean; clientId: string | null; client: { id: string; name: string; code: string } | null; _count: { tariffBook: number } };

type SortField = "name" | "code" | "status" | "aiModel" | "apiKeys" | "providers";

function formatDate(value: Date | string | null) {
  if (!value) return "Tidak ada";
  return new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function sortValue(client: Client, field: SortField) {
  if (field === "status") return client.isActive ? 1 : 0;
  if (field === "apiKeys") return client.apiKeys.length;
  if (field === "providers") return client.providers.length;
  return String(client[field] || "").toLowerCase();
}

export default function ClientApiKeysClient({ clients, assignableProviders, canManageClients }: { clients: Client[]; assignableProviders: AssignableProvider[]; canManageClients: boolean }) {
  const router = useRouter();
  const { showConfirm, showNotification } = useUI();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(new Set());
  const [clientModal, setClientModal] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null });
  const [keyModal, setKeyModal] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null });
  const [credential, setCredential] = useState<{ key: string; secret: string } | null>(null);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients
      .filter((client) => {
        const matchesSearch = !query || [client.name, client.code, client.aiModel || "", client.aiProvider || "", ...client.apiKeys.map((key) => key.name), ...client.providers.map((provider) => `${provider.name} ${provider.code}`)].some((value) => value.toLowerCase().includes(query));
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? client.isActive : !client.isActive);
        const matchesGateway = gatewayFilter === "all" || (gatewayFilter === "global" ? !client.aiProvider : client.aiProvider === gatewayFilter);
        return matchesSearch && matchesStatus && matchesGateway;
      })
      .sort((a, b) => {
        const aValue = sortValue(a, sortField);
        const bValue = sortValue(b, sortField);
        const result = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        return sortDirection === "asc" ? result : -result;
      });
  }, [clients, gatewayFilter, search, sortDirection, sortField, statusFilter]);

  function submitProviderAssignment(formData: FormData) {
    startTransition(async () => {
      const result = await assignTariffProviderToClient(formData);
      if (result.success) router.refresh();
      showNotification({
        type: result.success ? "success" : "error",
        title: result.success ? "Buku tarif diassign" : "Gagal",
        message: result.success ? "Provider buku tarif berhasil dihubungkan ke client." : result.error || "Gagal mengatur provider buku tarif.",
      });
    });
  }

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedClients = filteredClients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function toggleExpanded(clientId: string) {
    setExpandedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function submitClient(formData: FormData) {
    startTransition(async () => {
      const result = await upsertClient(formData);
      if (result.success) {
        setClientModal({ open: false, client: null });
        router.refresh();
      }
      showNotification({ type: result.success ? "success" : "error", title: result.success ? "Tersimpan" : "Gagal", message: result.success ? "Client berhasil disimpan." : result.error || "Gagal menyimpan client." });
    });
  }

  function submitCredential(formData: FormData) {
    const clientId = String(formData.get("clientId") || "");
    startTransition(async () => {
      const result = await createClientApiCredential(formData);
      if (result.success && result.key && result.secret) {
        setCredential({ key: result.key, secret: result.secret });
        setKeyModal({ open: false, client: null });
        setExpandedClientIds((current) => new Set(current).add(clientId));
        router.refresh();
        showNotification({ type: "success", title: "Credential dibuat", message: "API key ditambahkan ke list client. Salin secret sekarang." });
      } else {
        showNotification({ type: "error", title: "Gagal", message: result.error || "Gagal membuat credential." });
      }
    });
  }

  function toggleKey(id: string, isActive: boolean) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("isActive", String(isActive));
    startTransition(async () => {
      await setClientApiKeyStatus(formData);
      router.refresh();
    });
  }

  function handleDeleteClient(client: Client) {
    showConfirm({
      title: "Hapus Client",
      message: `Hapus ${client.name}? API key milik client ini akan dinonaktifkan dan dilepas dari client. Log penggunaan tetap disimpan untuk audit.`,
      confirmText: "Hapus Client",
      cancelText: "Batal",
      onConfirm: () => {
        const formData = new FormData();
        formData.set("id", client.id);
        startTransition(async () => {
          const result = await deleteClient(formData);
          if (result.success) router.refresh();
          showNotification({
            type: result.success ? "success" : "error",
            title: result.success ? "Client dihapus" : "Gagal",
            message: result.success ? "Client berhasil dihapus." : result.error || "Gagal menghapus client.",
          });
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-medium text-foreground">Daftar Client API Access</h2>
            <p className="mt-1 text-sm text-muted-foreground">Expand row client untuk melihat seluruh API key per environment.</p>
          </div>
          {canManageClients && (
            <button type="button" onClick={() => setClientModal({ open: true, client: null })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover">
              <Plus className="h-4 w-4" /> Add Client
            </button>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-3 border-b border-border p-4 ${canManageClients ? "lg:grid-cols-[1fr_180px_190px_120px]" : "lg:grid-cols-[1fr_180px_120px]"}`}> 
          <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search client, code, model, key name..." />
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm">
            <option value="all">Semua status</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          {canManageClients && (
            <select value={gatewayFilter} onChange={(event) => { setGatewayFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm">
              <option value="all">Semua gateway</option><option value="global">Global config</option><option value="vercel-ai-gateway">Vercel AI Gateway</option><option value="sumopod">SumoPod</option><option value="custom">Custom</option>
            </select>
          )}
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm">
            {defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3"><SortButton field="name" label="Client" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortButton field="code" label="Code" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortButton field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                {canManageClients && <th className="px-4 py-3">AI Gateway</th>}
                {canManageClients && <th className="px-4 py-3"><SortButton field="aiModel" label="Model" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>}
                <th className="px-4 py-3 text-right"><SortButton field="apiKeys" label="API Keys" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                {canManageClients && <th className="px-4 py-3 text-right"><SortButton field="providers" label="Buku Tarif" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paginatedClients.length === 0 ? <tr><td colSpan={canManageClients ? 9 : 6} className="px-4 py-10 text-center text-muted-foreground">Tidak ada client yang sesuai filter.</td></tr> : paginatedClients.map((client) => {
                const isExpanded = expandedClientIds.has(client.id);
                return (
                  <FragmentRow key={client.id} client={client} assignableProviders={assignableProviders} isExpanded={isExpanded} canManageClients={canManageClients} onToggle={() => toggleExpanded(client.id)} onEdit={() => setClientModal({ open: true, client })} onDelete={() => handleDeleteClient(client)} onGenerate={() => { setCredential(null); setKeyModal({ open: true, client }); }} onToggleKey={toggleKey} onAssignProvider={submitProviderAssignment} />
                );
              })}
            </tbody>
          </table>
        </div>

        <TablePagination total={filteredClients.length} visible={paginatedClients.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
      </section>

      {canManageClients && clientModal.open && <ClientModal client={clientModal.client} isPending={isPending} onClose={() => setClientModal({ open: false, client: null })} onSubmit={submitClient} />}
      {keyModal.open && <CredentialModal client={keyModal.client} isPending={isPending} onClose={() => setKeyModal({ open: false, client: null })} onSubmit={submitCredential} />}
    </div>
  );
}

function FragmentRow({ client, assignableProviders, isExpanded, canManageClients, onToggle, onEdit, onDelete, onGenerate, onToggleKey, onAssignProvider }: { client: Client; assignableProviders: AssignableProvider[]; isExpanded: boolean; canManageClients: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onGenerate: () => void; onToggleKey: (id: string, isActive: boolean) => void; onAssignProvider: (formData: FormData) => void }) {
  return (
    <>
      <tr className="hover:bg-muted/50">
        <td className="px-4 py-3"><button type="button" onClick={onToggle} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
        <td className="px-4 py-3"><p className="font-medium text-foreground">{client.name}</p><p className="text-xs text-muted-foreground">Request-based usage</p></td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{client.code}</td>
        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${client.isActive ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>{client.isActive ? "Active" : "Inactive"}</span></td>
        {canManageClients && <td className="px-4 py-3 text-muted-foreground">{client.aiProvider || "Global config"}</td>}
        {canManageClients && <td className="px-4 py-3 text-muted-foreground">{client.aiModel || "Global model"}</td>}
        <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{client.apiKeys.length}</td>
        {canManageClients && <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{client.providers.length}</td>}
        <td className="px-4 py-3"><div className="flex justify-end gap-2">{canManageClients ? <><button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /> Edit</button><button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button></> : <button type="button" onClick={onGenerate} className="rounded-md border border-primary/30 px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/5">Generate key</button>}</div></td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/50">
          <td></td>
          <td colSpan={canManageClients ? 8 : 5} className="px-4 py-4">
            <div className="space-y-4">
            {canManageClients && (
              <div className="rounded-lg border border-border bg-card">
                <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Master Buku Tarif</p>
                    <p className="mt-1 text-xs text-muted-foreground">Client memakai buku tarif dari provider yang diassign di sini.</p>
                  </div>
                  <form action={onAssignProvider} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input type="hidden" name="clientId" value={client.id} />
                    <select name="providerId" required className="min-h-11 rounded-md border border-border bg-card px-3 text-base text-foreground sm:min-w-[260px] sm:text-sm">
                      <option value="">Pilih provider buku tarif...</option>
                      {assignableProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name} ({provider._count.tariffBook} tarif){provider.clientId && provider.clientId !== client.id ? ` — assigned ke ${provider.client?.name || 'client lain'}` : provider.clientId === client.id ? ' — sudah assigned' : ' — belum assigned'}
                        </option>
                      ))}
                    </select>
                    <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover">Assign</button>
                  </form>
                </div>
                {client.providers.length === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground">Belum ada provider buku tarif untuk client ini.</p> : (
                  <div className="divide-y divide-border/60">{client.providers.map((provider) => (
                    <div key={provider.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="font-medium text-foreground">{provider.name}</p><p className="font-mono text-xs text-muted-foreground">{provider.code}</p></div>
                      <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{provider._count?.tariffBook || 0} tarif</span><form action={onAssignProvider}><input type="hidden" name="providerId" value={provider.id} /><button className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">Lepas</button></form></div>
                    </div>
                  ))}</div>
                )}
              </div>
            )}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">API Key List</p><button type="button" onClick={onGenerate} className="text-xs font-medium text-primary hover:underline">+ Generate key</button></div>
              {client.apiKeys.length === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground">Belum ada API key untuk client ini.</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-left">Name / Environment</th><th className="px-4 py-2 text-left">API Key</th><th className="px-4 py-2 text-left">API Secret</th><th className="px-4 py-2 text-left">Created</th><th className="px-4 py-2 text-left">Expired</th><th className="px-4 py-2 text-right">Status</th></tr></thead><tbody className="divide-y divide-border/60">{client.apiKeys.map((key) => <tr key={key.id}><td className="px-4 py-2 font-medium text-foreground">{key.name}</td><td className="px-4 py-2"><CredentialCell value={key.apiKey} unavailableLabel="Key lama tidak tersedia" /></td><td className="px-4 py-2"><CredentialCell value={key.apiSecret} unavailableLabel="Secret lama tidak tersedia" /></td><td className="px-4 py-2 text-muted-foreground">{formatDate(key.createdAt)}</td><td className="px-4 py-2 text-muted-foreground">{formatDate(key.expiresAt)}</td><td className="px-4 py-2 text-right"><button type="button" onClick={() => onToggleKey(key.id, !key.isActive)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${key.isActive ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>{key.isActive ? "Active" : "Inactive"}</button></td></tr>)}</tbody></table></div>
              )}
            </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CredentialCell({ value, unavailableLabel }: { value?: string | null; unavailableLabel: string }) {
  if (!value) return <span className="text-xs text-muted-foreground">{unavailableLabel}</span>;

  return (
    <div className="flex max-w-[240px] items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-foreground" title={value}>{value}</code>
      <button type="button" onClick={() => navigator.clipboard.writeText(value)} className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">Copy</button>
    </div>
  );
}

function ClientModal({ client, isPending, onClose, onSubmit }: { client: Client | null; isPending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) {
  const [aiProvider, setAiProvider] = useState(client?.aiProvider || "");
  const usesGlobalConfig = aiProvider === "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4  sm:items-center">
      <form action={onSubmit} className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-medium text-foreground">{client ? "Edit Client" : "Add Client"}</h3>
            <p className="text-sm text-muted-foreground">Konfigurasi tenant dan override AI hanya jika berbeda dari global config.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <input type="hidden" name="id" value={client?.id || ""} />
          <label className="text-sm font-medium text-foreground">
            Kode Client
            <input name="code" defaultValue={client?.code || ""} className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" placeholder="RS_ABC" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Nama Client
            <input name="name" defaultValue={client?.name || ""} className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" placeholder="RS ABC" />
          </label>

          <label className="text-sm font-medium text-foreground sm:col-span-2">
            AI Gateway Options
            <select name="aiProvider" value={aiProvider} onChange={(event) => setAiProvider(event.target.value)} className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm">
              <option value="">Ikuti global config</option>
              <option value="vercel-ai-gateway">Override: Vercel AI Gateway</option>
              <option value="sumopod">Override: SumoPod AI Gateway</option>
              <option value="custom">Override: Custom Gateway</option>
            </select>
            {usesGlobalConfig && (
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                Client ini akan memakai konfigurasi dari Core AI Integration. Field model, max token, temperature, dan gateway URL disembunyikan agar tidak duplikatif.
              </span>
            )}
          </label>

          {!usesGlobalConfig && (
            <>
              {aiProvider === "custom" && (
                <label className="text-sm font-medium text-foreground sm:col-span-2">
                  Custom Gateway URL
                  <input name="aiGatewayUrl" defaultValue={client?.aiGatewayUrl || ""} className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" placeholder="https://api.example.com/v1" />
                </label>
              )}
              <label className="text-sm font-medium text-foreground">
                AI Model
                <input name="aiModel" defaultValue={client?.aiModel || ""} className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" placeholder="gpt-4o-mini" />
              </label>
              <label className="text-sm font-medium text-foreground">
                Max Tokens
                <input name="aiMaxTokens" type="number" defaultValue={client?.aiMaxTokens || ""} className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" />
              </label>
              <label className="text-sm font-medium text-foreground">
                Temperature
                <input name="aiTemperature" type="number" min="0" max="2" step="0.1" defaultValue={client?.aiTemperature ?? ""} className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" />
              </label>
            </>
          )}

          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-foreground">
            <input name="isActive" type="checkbox" defaultChecked={client?.isActive ?? true} className="h-4 w-4 rounded border-border text-primary" /> Client aktif
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          <button disabled={isPending} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Save Client</button>
        </div>
      </form>
    </div>
  );
}

function CredentialModal({ client, isPending, onClose, onSubmit }: { client: Client | null; isPending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4  sm:items-center"><form action={onSubmit} className="w-full max-w-lg overflow-hidden rounded-[24px] border border-border bg-card shadow-xl"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h3 className="text-base font-medium text-foreground">Generate API Key & Secret</h3><p className="text-sm text-muted-foreground">Client: {client?.name}</p></div><button type="button" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div><div className="grid grid-cols-1 gap-4 p-5"><input type="hidden" name="clientId" value={client?.id || ""} /><label className="text-sm font-medium text-foreground">Credential Name / Env<input name="name" required placeholder="Production / Staging / Development" className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" /></label><label className="text-sm font-medium text-foreground">Expired At<input name="expiresAt" type="date" className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2.5 text-base text-foreground sm:text-sm" /></label></div><div className="flex justify-end gap-3 border-t border-border px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button><button disabled={isPending} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Generate</button></div></form></div>;
}
