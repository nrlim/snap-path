import { Suspense } from "react";
import Link from "next/link";
import { getTariffEntries, getProviders } from "./actions";
import TariffTable from "./components/TariffTable";
import TariffBulkImport from "./components/TariffBulkImport";

export default async function BukuTarifPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const providerId = searchParams.providerId;
  const category = searchParams.category;

  // We fetch standard page size
  const data = await getTariffEntries({ page, limit: 15, providerId, category });
  const providers = await getProviders();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Fee Schedules</h1>
          <p className="text-sm text-text-subtle mt-1">
            Manage master fee data for various insurance providers and procedures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TariffBulkImport providers={providers} />
          <Link
            href="/dashboard/master-data/buku-tarif/tambah"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Entry
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-text-subtle">Loading fee data...</div>}>
          <TariffTable 
            data={data.entries} 
            total={data.total}
            totalPages={data.totalPages}
            currentPage={page}
            providers={providers}
          />
        </Suspense>
      </div>
    </div>
  );
}
