import { Suspense } from "react";
import Link from "next/link";
import { getPathwayJobs } from "./actions";

export default async function ClinicalPathwayPage() {
  const jobs = await getPathwayJobs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Clinical Pathway Validations</h1>
          <p className="text-sm text-text-subtle mt-1">
            View history of generated clinical pathways and AI Brain validation results.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/clinical-pathway/baru"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Validate New Pathway
          </Link>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/50 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated shadow-sm mb-4">
            <svg className="w-8 h-8 text-text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6"></path><path d="M12 9v6"></path><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"></path></svg>
          </div>
          <h3 className="text-lg font-semibold text-text">No Validations Found</h3>
          <p className="text-sm text-text-subtle mt-1 mb-6 max-w-sm">
            You haven't generated any clinical pathways yet. Start by validating a new claim.
          </p>
          <Link
            href="/dashboard/clinical-pathway/baru"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
          >
            Validate New Pathway
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle uppercase tracking-wider border-b border-border/80">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Patient Name</th>
                  <th className="px-6 py-4">Provider</th>
                  <th className="px-6 py-4 text-right">Total Claim</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {jobs.map((job: any) => {
                  const input = job.inputPayload as any;
                  const patient = input?.patient;
                  
                  let totalClaim = input?.totalClaimAmount;
                  if (!totalClaim && input) {
                    const procTotal = (input.procedures || []).reduce((acc: number, p: any) => acc + ((p.price || 0) * (p.quantity || 1)), 0);
                    const medTotal = (input.medications || []).reduce((acc: number, m: any) => acc + ((m.price || 0) * (m.quantity || 1)), 0);
                    totalClaim = procTotal + medTotal;
                  }
                  
                  const currency = input?.currency || "IDR";

                  let statusBadge = null;
                  if (job.status === "COMPLETED") {
                    statusBadge = <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-500/20">Completed</span>;
                  } else if (job.status === "FAILED") {
                    statusBadge = <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-500/20">Failed</span>;
                  } else {
                    statusBadge = <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600 ring-1 ring-inset ring-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.3)] animate-pulse">Processing</span>;
                  }

                  return (
                    <tr key={job.id} className="transition-colors hover:bg-surface-elevated/40 group">
                      <td className="px-6 py-4 whitespace-nowrap text-text-subtle">
                        {new Date(job.createdAt).toLocaleDateString("id-ID", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4 font-medium text-text">
                        {patient?.name || "Unknown Patient"}
                      </td>
                      <td className="px-6 py-4 text-text-subtle">
                        {job.provider?.name || "-"}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        {totalClaim ? new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(totalClaim) : "-"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {statusBadge}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/dashboard/clinical-pathway/${job.id}`}
                          className="inline-flex items-center justify-center rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
                        >
                          View Results
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
