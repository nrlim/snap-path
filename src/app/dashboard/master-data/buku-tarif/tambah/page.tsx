import Link from "next/link";
import { getProviders } from "../actions";
import TariffForm from "../components/TariffForm";

export default async function TambahBukuTarifPage() {
  const providers = await getProviders();

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Add Fee Entry</h1>
          <p className="text-sm text-text-subtle mt-1">
            Insert new procedure data into the master fee schedule.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden p-6 sm:p-8">
        <TariffForm providers={providers} />
      </div>
    </div>
  );
}
