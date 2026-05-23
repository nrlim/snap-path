"use client";

import { useMemo, useState, useTransition } from "react";
import { defaultPageSizes, SortButton, TablePagination, TableSearch, type SortDirection } from "@/components/ui/DataTableControls";
import { updateUserRole } from "./actions";
import { useUI } from "@/components/providers/UIProvider";

type User = { id: string; email: string; name: string | null; role: string; clientId: string | null; client: { name: string; code: string } | null };
type Client = { id: string; name: string; code: string };
type SortField = "name" | "email" | "role" | "client";
const roles = ["SUPER_ADMIN", "ADMIN", "CLIENT_ADMIN", "CLIENT_USER", "VIEWER"];

function userName(user: User) {
  return user.name || user.email;
}

function sortValue(user: User, field: SortField) {
  if (field === "name") return userName(user).toLowerCase();
  if (field === "client") return (user.client?.name || "").toLowerCase();
  return String(user[field] || "").toLowerCase();
}

export default function UserManagementClient({ users, clients }: { users: User[]; clients: Client[] }) {
  const { showNotification } = useUI();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users
      .filter((user) => {
        const matchesSearch = !query || [userName(user), user.email, user.role, user.client?.name || "", user.client?.code || ""].some((value) => value.toLowerCase().includes(query));
        const matchesRole = roleFilter === "all" || user.role === roleFilter;
        const matchesClient = clientFilter === "all" || (clientFilter === "unassigned" ? !user.clientId : user.clientId === clientFilter);
        return matchesSearch && matchesRole && matchesClient;
      })
      .sort((a, b) => {
        const aValue = sortValue(a, sortField);
        const bValue = sortValue(b, sortField);
        const result = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        return sortDirection === "asc" ? result : -result;
      });
  }, [clientFilter, roleFilter, search, sortDirection, sortField, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await updateUserRole(formData);
      showNotification({ type: result.success ? "success" : "error", title: result.success ? "Role diperbarui" : "Gagal", message: result.success ? "Akses user berhasil diperbarui." : result.error || "Gagal memperbarui user." });
    });
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">User Management</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-subtle">Kelola role user internal SnapPath dan relasi user ke client.</p>
      </div>

      <section className="rounded-lg border border-border/80 bg-surface shadow-sm">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="text-base font-bold text-text">Daftar User</h2>
          <p className="mt-1 text-sm text-text-subtle">Table standar dengan search, filter, sorting, dan pagination.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-border/60 p-4 lg:grid-cols-[1fr_180px_220px_120px]">
          <TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search name, email, role, client..." />
          <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">
            <option value="all">Semua role</option>
            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select value={clientFilter} onChange={(event) => { setClientFilter(event.target.value); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">
            <option value="all">Semua client</option>
            <option value="unassigned">Tidak terikat client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text sm:text-sm">
            {defaultPageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-surface-elevated/50 text-xs uppercase tracking-wider text-text-subtle">
              <tr>
                <th className="px-4 py-3"><SortButton field="name" label="User" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortButton field="email" label="Email" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortButton field="role" label="Role" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortButton field="client" label="Client" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paginatedUsers.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-text-subtle">Tidak ada user yang sesuai filter.</td></tr> : paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-surface-elevated/30">
                  <td className="px-4 py-3"><p className="font-bold text-text">{userName(user)}</p></td>
                  <td className="px-4 py-3 text-text-subtle">{user.email}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{user.role}</span></td>
                  <td className="px-4 py-3 text-text-subtle">{user.client?.name || "Tidak terikat"}</td>
                  <td className="px-4 py-3">
                    <form action={submit} className="flex justify-end gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <select name="role" defaultValue={user.role} className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-text">{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select>
                      <select name="clientId" defaultValue={user.clientId || ""} className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-text"><option value="">No Client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
                      <button disabled={isPending} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-subtle hover:bg-surface-elevated disabled:opacity-50">Update</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TablePagination total={filteredUsers.length} visible={paginatedUsers.length} currentPage={currentPage} totalPages={totalPages} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
      </section>
    </div>
  );
}
