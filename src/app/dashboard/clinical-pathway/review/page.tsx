import Link from "next/link";

import { getReviewQueueData } from "./actions";
import ReviewQueueTable from "./ReviewQueueTable";

export default async function HitlReviewQueuePage(): Promise<React.ReactElement> {
  const data = await getReviewQueueData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Human-in-the-loop</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Review Klaim & Ajudikasi</h1>
          <p className="mt-2 max-w-3xl text-sm font-light leading-6 text-muted-foreground">
            Prioritaskan klaim yang membutuhkan keputusan reviewer berdasarkan temuan policy, klinis, tarif, obat, dokumen, dan LOS.
          </p>
        </div>
      </div>

      <ReviewQueueTable items={data.items} summary={data.summary} />
    </div>
  );
}
