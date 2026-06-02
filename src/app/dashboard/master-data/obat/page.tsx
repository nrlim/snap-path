import { Suspense } from "react";
import Link from "next/link";
import { getDrugPriceCacheEntries } from "./actions";
import DrugPriceCacheTable from "./components/DrugPriceCacheTable";

export default async function MasterObatPage() {
  const data = await getDrugPriceCacheEntries({ page: 1, limit: 1000 });

  const cards = [
    { label: "Total referensi", value: data.total, tone: "text-text" },
    { label: "Cache aktif", value: data.summary.active, tone: "text-green-700" },
    { label: "Kedaluwarsa", value: data.summary.expired, tone: "text-orange-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-faint">Reference Data</p>
          <h1 className="mt-1 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">Master Farmalkes</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-subtle">
            Pantau referensi harga obat, vaksin, suplemen, dan alat kesehatan yang digunakan validasi klaim. Data ini bersifat baca-saja dan diperbarui oleh master KFA atau proses validasi harga.
          </p>
        </div>
        <Link
          href="/dashboard/master-data/buku-tarif"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Lihat Master Buku Tarif
        </Link>
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
        <Suspense fallback={<div className="p-8 text-center text-text-subtle">Memuat referensi harga farmalkes...</div>}>
          <DrugPriceCacheTable data={data.entries} />
        </Suspense>
      </div>
    </div>
  );
}
