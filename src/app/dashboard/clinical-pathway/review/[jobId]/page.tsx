import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/rbac";
import { getPathwayResult } from "../../actions";
import { getReviewDecisionsForJob } from "../actions";
import AdjudicationPanel from "../../components/AdjudicationPanel";

export default async function ReviewWorkbenchPage(props: {
  params: Promise<{ jobId: string }>;
}) {
  const params = await props.params;
  const [job, reviewDecisions, user] = await Promise.all([
    getPathwayResult(params.jobId),
    getReviewDecisionsForJob(params.jobId),
    getAuthenticatedUser(),
  ]);

  if (!job) {
    notFound();
  }

  return (
    <div className="w-full space-y-6">
      {user && ["SUPER_ADMIN", "ADMIN", "CLIENT_ADMIN", "CLIENT_USER"].includes(user.role) ? (
        <AdjudicationPanel jobId={job.id} inputPayload={job.inputPayload} outputResult={job.outputResult} reviewDecisions={reviewDecisions} />
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Anda tidak memiliki akses untuk melihat form review.
        </div>
      )}
    </div>
  );
}
