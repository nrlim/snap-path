import Link from "next/link";
import { notFound } from "next/navigation";
import { getPathwayResult } from "../actions";
import PathwayResultViewer from "../components/PathwayResultViewer";

export default async function ClinicalPathwayResultPage(props: {
  params: Promise<{ jobId: string }>;
}) {
  const params = await props.params;
  const job = await getPathwayResult(params.jobId);

  if (!job) {
    notFound();
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Clinical Pathway Results</h1>
          <p className="text-sm text-text-subtle mt-1">
            Claim validation for patient
          </p>
        </div>
      </div>

      <PathwayResultViewer job={job} />
    </div>
  );
}
