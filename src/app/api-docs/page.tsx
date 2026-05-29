import fs from "fs";
import path from "path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/rbac";
import { ScalarDocs } from "./ScalarDocs";

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?next=/api-docs");
  }

  const role = user.role;
  const hasClientAccess = user.clientId !== null;
  const hasAdminAccess = ["SUPER_ADMIN", "ADMIN"].includes(role);

  if (!hasClientAccess && !hasAdminAccess) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-text">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-xl shadow-primary/10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-faint">Restricted API Docs</p>
          <h1 className="mt-3 text-xl font-bold">Akses API Docs belum aktif</h1>
          <p className="mt-2 text-sm leading-6 text-text-subtle">
            Akun Anda harus terhubung ke client yang sudah terdaftar atau memiliki role admin untuk membuka dokumentasi API SnapPath.
          </p>
          <Link href="/dashboard" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">
            Kembali ke Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const specPath = path.join(process.cwd(), "public", "swagger.json");
  let spec: Record<string, any> = {};

  try {
    const fileContent = fs.readFileSync(specPath, "utf8");
    spec = JSON.parse(fileContent);
  } catch (err) {
    console.error("[api-docs] Failed to load swagger.json:", err);
  }

  const servers: Array<{ url: string; description: string }> = [];

  if (process.env.NEXT_PUBLIC_APP_URL) {
    let url = process.env.NEXT_PUBLIC_APP_URL.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    servers.push({ url, description: "Production Server (via NEXT_PUBLIC_APP_URL)" });
  }

  servers.push({ url: "http://localhost:3000", description: "Local development server" });

  const seenUrls = new Set<string>();
  spec.servers = servers.filter((server) => {
    if (seenUrls.has(server.url)) return false;
    seenUrls.add(server.url);
    return true;
  });

  return (
    <div className="w-full min-h-screen bg-background">
      <ScalarDocs spec={spec} />
    </div>
  );
}
