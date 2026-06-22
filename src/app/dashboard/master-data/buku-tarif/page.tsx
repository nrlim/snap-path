import { Suspense } from "react";
import Link from "next/link";
import { getTariffEntries, getProviders, getTariffCategoryOptions } from "./actions";
import TariffTable from "./components/TariffTable";
import TariffBulkImport from "./components/TariffBulkImport";

export default async function BukuTarifPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = 1;

  // Table tools use server-side search/filter/pagination so results are not limited to the first loaded page.
  const [data, providers, categories] = await Promise.all([
    getTariffEntries({ page, limit: 10 }),
    getProviders(),
    getTariffCategoryOptions(),
  ]);

  const cards = [
    { label: "Total Tarif", value: data.total, tone: "text-foreground" },
    { label: "Tarif Aktif", value: data.summary.active, tone: "text-foreground" },
    { label: "Nonaktif", value: data.summary.inactive, tone: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Master Data</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Buku Tarif</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground font-light">
            Kelola data referensi tarif tindakan, layanan, dan prosedur untuk validasi klaim berdasarkan provider.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mt-2">
          <Link
            href="/dashboard/master-data/obat"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none"
          >
            Master Farmalkes →
          </Link>
          <TariffBulkImport providers={providers} />
          <Link
            href="/dashboard/master-data/buku-tarif/tambah"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90 focus:outline-none"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Tambah Entri
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{card.label}</p>
            <p className={`mt-3 text-3xl font-light tabular-nums ${card.tone}`}>{new Intl.NumberFormat("id-ID").format(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Suspense fallback={<div className="p-10 text-center text-muted-foreground font-light text-sm">Loading fee data...</div>}>
          <TariffTable 
            data={data.entries} 
            total={data.total}
            totalPages={data.totalPages}
            currentPage={page}
            providers={providers}
            categories={categories}
          />
        </Suspense>
      </div>
    </div>
  );
}
