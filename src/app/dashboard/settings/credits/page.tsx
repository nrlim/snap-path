import { redirect } from "next/navigation";
import { getCreditData } from "./actions";
import CreditClient from "./CreditClient";

export default async function CreditsPage() {
  const data = await getCreditData();
  if (!data) redirect("/dashboard");

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">Request Top Up</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-subtle">
            Kelola kuota request client untuk Clinical Pathway. Credit internal tetap tersedia untuk audit biaya super admin.
          </p>
        </div>
      </div>
      <CreditClient clients={data.clients} canTopUp={data.canTopUp} />
    </div>
  );
}
