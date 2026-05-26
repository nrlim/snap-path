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

  // Table tools are handled client-side for a consistent search/filter/sort/pagination UX.
  const [data, providers, categories] = await Promise.all([
    getTariffEntries({ page, limit: 1000 }),
    getProviders(),
    getTariffCategoryOptions(),
  ]);

  const cards = [
    { label: "Total tarif", value: data.total, tone: "text-text" },
    { label: "Tarif aktif", value: data.summary.active, tone: "text-green-700" },
    { label: "Nonaktif", value: data.summary.inactive, tone: "text-orange-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-faint">Reference Data</p>
          <h1 className="mt-1 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">Master Buku Tarif</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-subtle">
            Kelola data referensi tarif tindakan, layanan, dan prosedur untuk validasi klaim berdasarkan provider.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/master-data/obat"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            Lihat Master Obat
          </Link>
          <TariffBulkImport providers={providers} />
          <Link
            href="/dashboard/master-data/buku-tarif/tambah"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Tambah Entri
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border/80 bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">{card.label}</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${card.tone}`}>{new Intl.NumberFormat("id-ID").format(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-text-subtle">Loading fee data...</div>}>
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
