"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";

import { put } from "@vercel/blob/client";
import { FileText, File as FileIcon } from "lucide-react";

import type { ScoringDetail, ScoringResult } from "@/lib/ocr-scoring";

import OcrReviewTable from "./OcrReviewTable";

type WizardStep = "UPLOAD" | "POLLING" | "REVIEW" | "FORWARDED";

interface OcrProgressState {
  percent: number;
  label: string;
  detail: string;
  snaptextStatus: string;
  pollCount: number;
  startedAtMs: number | null;
}

interface OcrPollResponse {
  status?: string;
  snaptextStatus?: string;
  matchScore?: number;
  scoringDetails?: ScoringDetail[];
  ocrRawResult?: unknown;
  txtItems?: unknown;
  masterDataLookup?: unknown;
  error?: string;
}

interface BlobUploadTarget {
  path: string;
  token: string;
}

interface OcrUploadUrlResponse {
  pdf?: BlobUploadTarget;
  error?: string;
}

const WIZARD_STEPS: WizardStep[] = ["UPLOAD", "POLLING", "REVIEW", "FORWARDED"];
const DEFAULT_MAX_PDF_SIZE_MB = 100;
const MAX_TXT_SIZE_BYTES = 2 * 1024 * 1024;

const INITIAL_PROGRESS: OcrProgressState = {
  percent: 0,
  label: "Menunggu dokumen",
  detail: "Unggah PDF invoice dan TXT ground truth untuk memulai OCR.",
  snaptextStatus: "PENDING",
  pollCount: 0,
  startedAtMs: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getClientMaxPdfSizeMb(): number {
  const rawLimitMb = process.env.NEXT_PUBLIC_OCR_MAX_PDF_UPLOAD_MB;
  if (!rawLimitMb) return DEFAULT_MAX_PDF_SIZE_MB;

  const parsedLimitMb = Number.parseInt(rawLimitMb, 10);
  if (!Number.isFinite(parsedLimitMb) || parsedLimitMb <= 0) return DEFAULT_MAX_PDF_SIZE_MB;

  return parsedLimitMb;
}

function isScoringDetail(value: unknown): value is ScoringDetail {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.field === "string" &&
    typeof value.label === "string" &&
    typeof value.expected === "string" &&
    typeof value.actual === "string" &&
    typeof value.match === "boolean" &&
    typeof value.similarity === "number" &&
    typeof value.valueType === "string"
  );
}

function parseScoringDetails(value: unknown): ScoringDetail[] {
  return Array.isArray(value) ? value.filter(isScoringDetail) : [];
}

function parsePollResponse(value: unknown): OcrPollResponse {
  if (!isRecord(value)) return {};

  return {
    status: readString(value, "status"),
    snaptextStatus: readString(value, "snaptextStatus"),
    matchScore: readNumber(value, "matchScore"),
    scoringDetails: parseScoringDetails(value.scoringDetails),
    ocrRawResult: value.ocrRawResult,
    txtItems: value.txtItems,
    masterDataLookup: value.masterDataLookup,
    error: readString(value, "error"),
  };
}

function parseBlobUploadTarget(value: unknown): BlobUploadTarget | undefined {
  if (!isRecord(value)) return undefined;

  const path = readString(value, "path");
  const token = readString(value, "token");

  return path && token ? { path, token } : undefined;
}

function parseUploadUrlResponse(value: unknown): OcrUploadUrlResponse {
  if (!isRecord(value)) return {};

  return {
    pdf: parseBlobUploadTarget(value.pdf),
    error: readString(value, "error"),
  };
}

async function calculateFileSha256(file: File): Promise<string> {
  if (!window.crypto.subtle) {
    throw new Error("Browser tidak mendukung hashing file yang dibutuhkan untuk OCR.");
  }

  const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getStepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

function getSnaptextStatusLabel(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized.includes("UPLOAD")) return "Mengirim dokumen";
  if (normalized.includes("QUEU") || normalized.includes("PENDING")) return "Menunggu antrean SnapText";
  if (normalized.includes("PROCESS") || normalized.includes("OCR")) return "OCR sedang berlangsung";
  if (normalized.includes("COMPLETED") || normalized.includes("DONE")) return "OCR selesai";
  if (normalized.includes("FAILED") || normalized.includes("ERROR")) return "OCR gagal";

  return "Memproses dokumen";
}

function getProcessingBasePercent(status: string): number {
  const normalized = status.toUpperCase();

  if (normalized.includes("UPLOAD")) return 20;
  if (normalized.includes("QUEU") || normalized.includes("PENDING")) return 35;
  if (normalized.includes("PROCESS") || normalized.includes("OCR")) return 55;
  if (normalized.includes("EXTRACT") || normalized.includes("PARSE")) return 72;
  if (normalized.includes("SCOR")) return 84;
  if (normalized.includes("COMPLETED") || normalized.includes("DONE")) return 96;

  return 45;
}

function buildProcessingProgress(status: string, elapsedMs: number, pollCount: number): OcrProgressState {
  const basePercent = getProcessingBasePercent(status);
  const elapsedBoost = Math.min(28, Math.floor(elapsedMs / 4000) * 4);
  const pollBoost = Math.min(8, pollCount * 2);
  const percent = Math.min(92, Math.max(basePercent, basePercent + elapsedBoost + pollBoost));
  const label = getSnaptextStatusLabel(status);

  return {
    percent,
    label,
    detail: "Dokumen masih diproses di SnapText. Halaman akan memperbarui status otomatis setiap beberapa detik.",
    snaptextStatus: status,
    pollCount,
    startedAtMs: null,
  };
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} detik`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes} menit ${remainingSeconds.toString().padStart(2, "0")} detik`;
}

export default function OcrUploadWizard(): ReactElement {
  const [step, setStep] = useState<WizardStep>("UPLOAD");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [txtFile, setTxtFile] = useState<File | null>(null);
  const [ocrJobId, setOcrJobId] = useState<string | null>(null);
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [ocrRawResult, setOcrRawResult] = useState<unknown>(null);
  const [txtItems, setTxtItems] = useState<unknown>(null);
  const [masterDataLookup, setMasterDataLookup] = useState<unknown>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrProgressState>(INITIAL_PROGRESS);
  const [nowMs, setNowMs] = useState(Date.now());
  const uploadInFlightRef = useRef(false);

  const maxPdfSizeMb = useMemo(() => getClientMaxPdfSizeMb(), []);
  const maxPdfSizeBytes = maxPdfSizeMb * 1024 * 1024;

  const elapsedSeconds = useMemo(() => {
    if (!progress.startedAtMs || step !== "POLLING") return 0;
    return Math.max(0, Math.floor((nowMs - progress.startedAtMs) / 1000));
  }, [nowMs, progress.startedAtMs, step]);

  const handleUpload = async (): Promise<void> => {
    if (uploadInFlightRef.current) return;

    if (!pdfFile || !txtFile) {
      setError("Silakan lengkapi PDF invoice dan TXT ground truth.");
      return;
    }

    if (pdfFile.size > maxPdfSizeBytes) {
      setError(`Ukuran PDF melebihi batas ${maxPdfSizeMb}MB. Kompres atau pisahkan dokumen sebelum diunggah.`);
      return;
    }

    if (txtFile.size > MAX_TXT_SIZE_BYTES) {
      setError("Ukuran TXT melebihi batas 2MB. Gunakan file ground truth yang lebih ringkas.");
      return;
    }

    uploadInFlightRef.current = true;
    setIsUploading(true);
    setError(null);
    setProgress({
      percent: 18,
      label: "Mengunggah dokumen",
      detail: "PDF invoice sedang dikirim dan job OCR sedang dibuat di SnapText.",
      snaptextStatus: "UPLOADING",
      pollCount: 0,
      startedAtMs: null,
    });

    try {
      setProgress((previous) => ({
        ...previous,
        percent: 8,
        label: "Menyiapkan dokumen",
        detail: "CONSUL sedang menghitung hash PDF dan membaca TXT acuan sebelum membuat token unggahan.",
      }));

      const [pdfHash, txtContent] = await Promise.all([
        calculateFileSha256(pdfFile),
        txtFile.text(),
      ]);

      setProgress((previous) => ({
        ...previous,
        percent: 18,
        label: "Membuat token unggahan",
        detail: "Server membuat token upload langsung ke Blob Storage seperti pola SnapText.",
      }));

      // 1. Dapatkan token upload dari server. Token ini tidak memanggil Supabase Storage.
      const urlRes = await fetch("/api/v1/ocr/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfName: pdfFile.name,
          pdfSize: pdfFile.size,
          pdfHash,
          txtName: txtFile.name,
          txtSize: txtFile.size,
        }),
      });

      const urlData = parseUploadUrlResponse(await urlRes.json());

      if (!urlRes.ok) {
        throw new Error(urlData.error || "Gagal mendapatkan token unggahan dari server.");
      }

      if (!urlData.pdf) {
        throw new Error("Server tidak mengembalikan token unggahan PDF yang lengkap.");
      }

      setProgress((previous) => ({
        ...previous,
        percent: 25,
        label: "Mengunggah PDF",
        detail: "PDF dikirim langsung ke Blob Storage. Halaman dikunci sampai upload selesai.",
      }));

      // 2. Unggah PDF langsung dari browser seperti implementasi SnapText.
      const blobResult = await put(urlData.pdf.path, pdfFile, {
        access: "public",
        token: urlData.pdf.token,
        contentType: pdfFile.type || "application/pdf",
        onUploadProgress: (event) => {
          setProgress((previous) => ({
            ...previous,
            percent: Math.min(85, 25 + Math.floor(event.percentage * 0.6)),
            label: "Mengunggah PDF",
            detail: "PDF dikirim langsung ke Blob Storage. Halaman dikunci sampai upload selesai.",
          }));
        },
      });

      setProgress((previous) => ({
        ...previous,
        percent: 90,
        label: "Memulai OCR",
        detail: "Upload selesai. CONSUL sedang membuat job OCR di SnapText.",
      }));

      // 3. Proses OCR di server. Server hanya menerima URL PDF dan TXT kecil, bukan binary PDF.
      const res = await fetch("/api/v1/ocr/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfPath: urlData.pdf.path,
          pdfUrl: blobResult.url,
          pdfName: pdfFile.name,
          pdfSize: pdfFile.size,
          pdfHash,
          txtContent,
        }),
      });
      
      if (res.status === 413) {
        throw new Error("Ukuran file terlalu besar. Server menolak permintaan (Request Entity Too Large).");
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        throw new Error(`Server merespons dengan format tidak valid: ${textError.slice(0, 50)}...`);
      }

      const rawData: unknown = await res.json();
      const data = isRecord(rawData) ? rawData : {};
      const responseError = readString(data, "error");

      if (!res.ok) throw new Error(responseError || "Gagal memulai proses OCR.");

      const nextOcrJobId = readString(data, "ocrJobId");
      if (!nextOcrJobId) throw new Error("Server tidak mengembalikan ID job OCR.");

      const snaptextStatus = readString(data, "snaptextStatus") || readString(data, "status") || "PENDING";
      setOcrJobId(nextOcrJobId);
      setProgress({
        percent: 35,
        label: getSnaptextStatusLabel(snaptextStatus),
        detail: "File sudah diterima. CONSUL akan mengecek status SnapText sampai hasil OCR siap dinilai.",
        snaptextStatus,
        pollCount: 0,
        startedAtMs: Date.now(),
      });
      setStep("POLLING");
      uploadInFlightRef.current = false;
    } catch (uploadError: unknown) {
      uploadInFlightRef.current = false;
      setError(getErrorMessage(uploadError, "Gagal mengunggah file."));
      setProgress(INITIAL_PROGRESS);
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (step !== "POLLING") return;

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [step]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;

    const pollJob = async (): Promise<void> => {
      if (!ocrJobId || step !== "POLLING") return;

      try {
        const res = await fetch(`/api/v1/ocr/poll?ocrJobId=${encodeURIComponent(ocrJobId)}`);
        const data = parsePollResponse(await res.json());

        if (!res.ok) {
          throw new Error(data.error || "Gagal mengecek status OCR.");
        }

        if (data.status === "APPROVED" || data.status === "REVIEW_NEEDED") {
          const details = data.scoringDetails ?? [];
          setScoringResult({
            score: data.matchScore ?? 0,
            totalFields: details.length,
            matchedFields: details.filter((detail) => detail.match).length,
            details,
          });
          setOcrRawResult(data.ocrRawResult);
          setTxtItems(data.txtItems);
          setMasterDataLookup(data.masterDataLookup);
          setProgress((previous) => ({
            ...previous,
            percent: 100,
            label: "OCR selesai",
            detail: "Hasil OCR sudah siap untuk direview dan dibandingkan dengan ground truth.",
            snaptextStatus: "COMPLETED",
          }));
          setStep("REVIEW");
          setIsUploading(false);
          return;
        }

        if (data.status === "FAILED") {
          setError("Proses OCR gagal di server SnapText.");
          setStep("UPLOAD");
          setIsUploading(false);
          setProgress(INITIAL_PROGRESS);
          return;
        }

        const processingStatus = data.snaptextStatus || data.status || "OCR_PROCESSING";
        setProgress((previous) => {
          const startedAtMs = previous.startedAtMs ?? Date.now();
          const pollCount = previous.pollCount + 1;
          const elapsedMs = Date.now() - startedAtMs;
          const nextProgress = buildProcessingProgress(processingStatus, elapsedMs, pollCount);

          return {
            ...nextProgress,
            startedAtMs,
          };
        });

        if (!isCancelled) {
          timeoutId = setTimeout(pollJob, 3000);
        }
      } catch (pollError: unknown) {
        console.error("Polling error:", pollError);
        setProgress((previous) => ({
          ...previous,
          detail: "Koneksi polling sempat terganggu. CONSUL akan mencoba mengecek ulang status OCR secara otomatis.",
        }));

        if (!isCancelled) {
          timeoutId = setTimeout(pollJob, 3000);
        }
      }
    };

    if (step === "POLLING") {
      void pollJob();
    }

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ocrJobId, step]);

  const handleForwarded = (): void => {
    setStep("FORWARDED");
  };

  const handlePdfFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setPdfFile(event.target.files?.[0] ?? null);
  };

  const handleTxtFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setTxtFile(event.target.files?.[0] ?? null);
  };

  const isUploadLocked = isUploading && step === "UPLOAD";

  return (
    <div className="w-full space-y-6" aria-busy={isUploadLocked}>
      {isUploadLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-slate-950">{progress.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{progress.detail}</p>
                <p className="mt-3 font-mono text-xs text-slate-500">{progress.percent}% · Jangan tutup halaman ini</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Steps Indicator */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        {WIZARD_STEPS.map((currentStep, index) => (
          <div key={currentStep} className="flex items-center">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
              step === currentStep ? "bg-sky-700 text-white" :
              getStepIndex(step) > index ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
            }`}>
              {index + 1}
            </div>
            <span className={`ml-2 hidden text-sm font-medium sm:block ${step === currentStep ? "text-foreground" : "text-muted-foreground"}`}>
              {currentStep === "POLLING" ? "Memproses OCR" : currentStep === "REVIEW" ? "Review & Koreksi" : currentStep === "FORWARDED" ? "Selesai" : "Unggah File"}
            </span>
            {index < WIZARD_STEPS.length - 1 && <div className="mx-4 h-px w-8 bg-slate-200 sm:w-16" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {step === "UPLOAD" && (
        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-lg font-medium text-foreground">Unggah Invoice & Ground Truth</h3>
            <p className="text-sm text-muted-foreground">Silakan unggah PDF invoice untuk di-OCR dan file TXT sebagai acuan ground truth berbasis schema SnapText.</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className={`relative flex flex-col items-center justify-center rounded-xl border border-slate-200 p-8 text-center transition-colors ${pdfFile ? 'bg-sky-50/50 border-sky-200' : 'bg-slate-50 hover:bg-slate-100/50'}`}>
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${pdfFile ? 'bg-sky-100 text-sky-600' : 'bg-white text-slate-400 shadow-sm border border-slate-100'}`}>
                  <FileText className="h-6 w-6" />
                </div>
                <h4 className="mb-1 text-sm font-medium text-foreground">PDF Invoice</h4>
                <p className="mb-5 text-xs text-muted-foreground">Upload dokumen tagihan dari faskes</p>
                
                <label className={`relative rounded-md bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm ring-1 ring-inset ring-slate-200 transition-colors ${isUploadLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                  <span>Pilih File</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfFileChange}
                    disabled={isUploadLocked}
                    className="sr-only"
                  />
                </label>
                {pdfFile && <p className="mt-4 max-w-[200px] truncate text-xs font-medium text-sky-700">{pdfFile.name}</p>}
              </div>

              <div className={`relative flex flex-col items-center justify-center rounded-xl border border-slate-200 p-8 text-center transition-colors ${txtFile ? 'bg-sky-50/50 border-sky-200' : 'bg-slate-50 hover:bg-slate-100/50'}`}>
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${txtFile ? 'bg-sky-100 text-sky-600' : 'bg-white text-slate-400 shadow-sm border border-slate-100'}`}>
                  <FileIcon className="h-6 w-6" />
                </div>
                <h4 className="mb-1 text-sm font-medium text-foreground">TXT Acuan Ground Truth</h4>
                <p className="mb-5 text-xs text-muted-foreground">Upload data ekspektasi (CSV/TXT)</p>
                
                <label className={`relative rounded-md bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm ring-1 ring-inset ring-slate-200 transition-colors ${isUploadLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                  <span>Pilih File</span>
                  <input
                    type="file"
                    accept="text/plain,.csv"
                    onChange={handleTxtFileChange}
                    disabled={isUploadLocked}
                    className="sr-only"
                  />
                </label>
                {txtFile && <p className="mt-4 max-w-[200px] truncate text-xs font-medium text-sky-700">{txtFile.name}</p>}
              </div>
            </div>
          </div>

          {isUploading && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-sky-950">{progress.label}</p>
                  <p className="mt-1 text-xs leading-5 text-sky-800/80">{progress.detail}</p>
                </div>
                <span className="font-mono text-sm text-sky-800">{progress.percent}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                <div className="h-full rounded-full bg-sky-700 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploadLocked}
              className="min-h-11 rounded-md bg-sky-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? "Mengunggah & Memulai OCR..." : "Mulai Proses OCR"}
            </button>
          </div>
        </div>
      )}

      {step === "POLLING" && (
        <div className="rounded-lg border border-sky-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="w-full space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sky-700 text-white">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-[0.16em] text-sky-700">SnapText OCR</p>
                    <h3 className="mt-1 text-lg font-medium text-foreground">{progress.label}</h3>
                  </div>
                  <span className="w-fit rounded border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-xs text-sky-800">
                    {progress.percent}%
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{progress.detail}</p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Status: <span className="font-mono text-foreground">{progress.snaptextStatus}</span></span>
                <span>Durasi: {formatElapsed(elapsedSeconds)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                <div className="h-full rounded-full bg-sky-700 transition-all duration-500 ease-out" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-green-100 bg-green-50/60 p-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-green-700/80">File</p>
                <p className="mt-1 text-sm font-medium text-green-950">Diterima</p>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-sky-700/80">OCR</p>
                <p className="mt-1 text-sm font-medium text-sky-950">Sedang diproses</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">Skoring</p>
                <p className="mt-1 text-sm font-medium text-slate-700">Menunggu hasil OCR</p>
              </div>
            </div>

            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-muted-foreground">
              Tidak perlu refresh halaman. Jika koneksi polling terputus sementara, CONSUL akan mencoba ulang otomatis tanpa membatalkan job SnapText.
            </p>
          </div>
        </div>
      )}

      {step === "REVIEW" && scoringResult && ocrJobId && (
        <OcrReviewTable
          ocrJobId={ocrJobId}
          scoringResult={scoringResult}
          ocrRawResult={ocrRawResult}
          txtItems={txtItems}
          onCorrected={setScoringResult}
          onForward={handleForwarded}
        />
      )}

      {step === "FORWARDED" && (
        <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border border-slate-200 bg-white py-24 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h3 className="text-lg font-medium text-foreground">Validasi Klaim Dimulai</h3>
          <p className="text-center text-sm text-muted-foreground">Skor OCR 100%. Payload validasi klaim sudah dibuat dari invoice dan workflow validasi telah dijalankan.</p>
        </div>
      )}
    </div>
  );
}
