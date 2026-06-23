import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/rbac";
import { getPathwayResult } from "../actions";
import { getReviewDecisionsForJob } from "../review/actions";
import PathwayResultViewer from "../components/PathwayResultViewer";

export default async function ClinicalPathwayResultPage(props: {
  params: Promise<{ jobId: string }>;
}) {
  const params = await props.params;
  const [job, user] = await Promise.all([
    getPathwayResult(params.jobId),
    getAuthenticatedUser(),
  ]);

  if (!job) {
    notFound();
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-4 border-b border-border pb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground/80">Workflow Detail</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-slate-800">Clinical Pathway Results</h1>
          <p className="text-sm text-slate-500 font-light mt-2 max-w-2xl leading-6">
            Detailed validation report for the processed claim
          </p>
        </div>
      </div>


      <PathwayResultViewer job={job} />
    </div>
  );
}
