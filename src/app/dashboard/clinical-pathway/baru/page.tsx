import Link from "next/link";
import { getProviders } from "../../master-data/buku-tarif/actions";
import PathwayWizard from "../components/PathwayWizard";


export default async function BaruClinicalPathwayPage() {
  const providers = await getProviders();

  return (
    <div className="w-full space-y-6">


      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden p-6 sm:p-8">
        <PathwayWizard providers={providers} />
      </div>
    </div>
  );
}
