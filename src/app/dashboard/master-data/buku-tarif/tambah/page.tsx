import Link from "next/link";
import { getProviders, getTariffCategoryOptions } from "../actions";
import TariffForm from "../components/TariffForm";

export default async function TambahBukuTarifPage() {
  const [providers, categories] = await Promise.all([
    getProviders(),
    getTariffCategoryOptions(),
  ]);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Buku Tarif</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Add Fee Entry</h1>
          <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl leading-6">
            Insert new procedure data into the master fee schedule.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden p-6 sm:p-8">
        <TariffForm providers={providers} categories={categories} />
      </div>
    </div>
  );
}
