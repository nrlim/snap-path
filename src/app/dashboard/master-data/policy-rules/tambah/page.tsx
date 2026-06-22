import Link from "next/link";
import PolicyRuleForm from "../components/PolicyRuleForm";

export default function TambahPolicyRulePage() {
  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Master Data</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Tambah Policy Rule</h1>
          <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl leading-6">
            Buat aturan baru untuk pembatasan manfaat, pengecualian, maupun hak kamar khusus.
          </p>
        </div>
        <Link
          href="/dashboard/master-data/policy-rules"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none mt-2"
        >
          ← Kembali
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden p-6 sm:p-8">
        <PolicyRuleForm />
      </div>
    </div>
  );
}
