"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScoringDetail, ScoringResult } from "@/lib/ocr-scoring";
import OcrReviewTable from "../../components/OcrReviewTable";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface OcrReviewClientProps {
  jobId: string;
}

export default function OcrReviewClient({ jobId }: OcrReviewClientProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [ocrRawResult, setOcrRawResult] = useState<unknown>(null);
  const [txtItems, setTxtItems] = useState<unknown>(null);
  const [txtContent, setTxtContent] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);

  useEffect(() => {
    const fetchJobData = async () => {
      try {
        const res = await fetch(`/api/v1/ocr/poll?ocrJobId=${encodeURIComponent(jobId)}`);
        const data: unknown = await res.json();
        
        if (!res.ok) {
          const errorMessage = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Gagal mengambil data OCR.";
          throw new Error(errorMessage);
        }

        const response = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
        const details: ScoringDetail[] = Array.isArray(response.scoringDetails) ? response.scoringDetails.filter((item): item is ScoringDetail => {
          return typeof item === "object" && item !== null &&
            "id" in item && typeof item.id === "string" &&
            "field" in item && typeof item.field === "string" &&
            "label" in item && typeof item.label === "string" &&
            "expected" in item && typeof item.expected === "string" &&
            "actual" in item && typeof item.actual === "string" &&
            "match" in item && typeof item.match === "boolean" &&
            "similarity" in item && typeof item.similarity === "number" &&
            "valueType" in item && typeof item.valueType === "string";
        }) : [];
        setScoringResult({
          score: typeof response.matchScore === "number" ? response.matchScore : 0,
          totalFields: details.length,
          matchedFields: details.filter((detail) => detail.match).length,
          details,
        });
        setOcrRawResult(response.ocrRawResult);
        setTxtItems(response.txtItems);
        setTxtContent(typeof response.txtContent === "string" ? response.txtContent : null);
        setPdfUrl(typeof response.pdfUrl === "string" ? response.pdfUrl : null);
        if (typeof response.processingTimeMs === "number") {
          setProcessingTimeMs(response.processingTimeMs);
        }

      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchJobData();
  }, [jobId]);

  const handleForwarded = (claimJobId?: string) => {
    console.log("handleForwarded called with claimJobId:", claimJobId);
    if (claimJobId) {
      window.location.href = `/dashboard/clinical-pathway/${claimJobId}`;
    } else {
      window.location.href = "/dashboard/clinical-pathway/ocr-import";
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border border-slate-200 bg-white py-24 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Memuat data review OCR...</p>
      </div>
    );
  }

  if (error || !scoringResult) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/clinical-pathway/ocr-import" className="inline-flex items-center text-sm font-medium text-sky-700 hover:underline">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Kembali ke Riwayat
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Data tidak ditemukan."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/clinical-pathway/ocr-import" className="inline-flex items-center text-sm font-medium text-sky-700 hover:underline">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Kembali ke Riwayat
        </Link>
        <div className="flex flex-col items-end gap-1">
          <div className="font-mono text-xs text-slate-500">Job ID: {jobId}</div>
          {processingTimeMs !== null && (
            <div className="text-xs font-medium text-slate-500">
              Waktu Proses OCR: {(processingTimeMs / 1000).toFixed(2)} detik
            </div>
          )}
        </div>
      </div>

      <OcrReviewTable 
        ocrJobId={jobId} 
        scoringResult={scoringResult}
        ocrRawResult={ocrRawResult}
        txtItems={txtItems}
        txtContent={txtContent}
        pdfUrl={pdfUrl ?? undefined}
        onCorrected={(updatedScoring) => setScoringResult(updatedScoring)}
        onForward={(claimJobId) => {
          if (claimJobId) {
            router.push(`/dashboard/clinical-pathway/${claimJobId}`);
          } else {
            router.push('/dashboard/clinical-pathway');
          }
        }}
      />
    </div>
  );
}
