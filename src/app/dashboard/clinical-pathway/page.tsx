import Link from "next/link";
import { getPathwayJobs } from "./actions";
import PathwayValidationTable from "./components/PathwayValidationTable";

export default async function ClinicalPathwayPage() {
  const jobs = await getPathwayJobs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Workflows</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Pathway Validation</h1>
          <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl leading-6">View history of generated clinical pathways and AI Brain validation results.</p>
        </div>
        <Link href="/dashboard/clinical-pathway/baru" className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90 focus:outline-none mt-2">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Validate New Pathway
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-16 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted border border-border mb-4"><svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6"></path><path d="M12 9v6"></path><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"></path></svg></div>
          <h3 className="text-lg font-medium text-foreground">No Validations Found</h3>
          <p className="text-sm text-muted-foreground font-light mt-1 mb-6 max-w-sm">You haven't generated any clinical pathways yet. Start by validating a new claim.</p>
          <Link href="/dashboard/clinical-pathway/baru" className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none">Start Validation</Link>
        </div>
      ) : <PathwayValidationTable jobs={jobs} />}
    </div>
  );
}
