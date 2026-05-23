import Link from "next/link";
import { getPathwayJobs } from "./actions";
import PathwayValidationTable from "./components/PathwayValidationTable";

export default async function ClinicalPathwayPage() {
  const jobs = await getPathwayJobs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Clinical Pathway Validations</h1>
          <p className="text-sm text-text-subtle mt-1">View history of generated clinical pathways and AI Brain validation results.</p>
        </div>
        <Link href="/dashboard/clinical-pathway/baru" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Validate New Pathway
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/50 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated shadow-sm mb-4"><svg className="w-8 h-8 text-text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6"></path><path d="M12 9v6"></path><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"></path></svg></div>
          <h3 className="text-lg font-semibold text-text">No Validations Found</h3>
          <p className="text-sm text-text-subtle mt-1 mb-6 max-w-sm">You haven't generated any clinical pathways yet. Start by validating a new claim.</p>
          <Link href="/dashboard/clinical-pathway/baru" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors">Validate New Pathway</Link>
        </div>
      ) : <PathwayValidationTable jobs={jobs} />}
    </div>
  );
}
