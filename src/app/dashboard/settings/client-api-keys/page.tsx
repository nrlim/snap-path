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
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Client API Keys</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Generate API key dan secret untuk client eksternal. SnapPath dashboard tetap memakai JWT session user login.</p>
        </div>
        <Link href="/api-docs" target="_blank" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted">
          Buka API Docs
        </Link>
      </div>
      <ClientApiKeysClient clients={clients} assignableProviders={assignableProviders} canManageClients={user.role === "SUPER_ADMIN" || user.role === "ADMIN"} />
    </div>
  );
}
