import Link from "next/link";
import { notFound } from "next/navigation";
import { getProviders, getTariffCategoryOptions, getTariffEntryById } from "../actions";
import TariffForm from "../components/TariffForm";

export default async function EditBukuTarifPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const [providers, categories, entry] = await Promise.all([
    getProviders(),
    getTariffCategoryOptions(),
    getTariffEntryById(params.id)
  ]);

  if (!entry) {
    notFound();
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Edit Fee Entry</h1>
          <p className="text-sm text-text-subtle mt-1">
            Update procedure data for <strong>{entry.procedureName}</strong>{entry.procedureCode ? <span className="font-mono text-text-faint"> — {entry.procedureCode}</span> : null}.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden p-6 sm:p-8">
        <TariffForm initialData={entry} providers={providers} categories={categories} />
      </div>
    </div>
  );
}
