import OcrReviewClient from "./OcrReviewClient";

export const metadata = {
  title: "Review OCR Job | CONSUL",
};

interface PageProps {
  params: Promise<{
    jobId: string;
  }>;
}

export default async function OcrReviewPage({ params }: PageProps) {
  const resolvedParams = await params;
  
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Review Hasil OCR</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Periksa ulang hasil ekstrak SnapText dan bandingkan dengan ground truth TXT secara manual.
        </p>
      </div>

      <OcrReviewClient jobId={resolvedParams.jobId} />
    </div>
  );
}
