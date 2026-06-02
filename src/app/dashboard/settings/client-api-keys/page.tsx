import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserPermission } from "@/lib/rbac";
import ClientApiKeysClient from "./ClientApiKeysClient";
import { getAssignableTariffProviders, getClientApiKeyData } from "./actions";

export default async function ClientApiKeysPage() {
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user) {
    redirect("/dashboard");
  }

  const [clients, assignableProviders] = await Promise.all([
    getClientApiKeyData(),
    user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? getAssignableTariffProviders() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">Client API Keys</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-subtle">Generate API key dan secret untuk client eksternal. SnapPath dashboard tetap memakai JWT session user login.</p>
        </div>
        <Link href="/api-docs" target="_blank" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-elevated">
          Buka API Docs
        </Link>
      </div>
      <ClientApiKeysClient clients={clients} assignableProviders={assignableProviders} canManageClients={user.role === "SUPER_ADMIN" || user.role === "ADMIN"} />
    </div>
  );
}
