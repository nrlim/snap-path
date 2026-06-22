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
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Request Top Up</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Kelola kuota request client untuk Clinical Pathway. Credit internal tetap tersedia untuk audit biaya super admin.
          </p>
        </div>
      </div>
      <CreditClient clients={data.clients} canTopUp={data.canTopUp} />
    </div>
  );
}
