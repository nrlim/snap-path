"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";

import { put } from "@vercel/blob/client";
import { FileText, File as FileIcon, Check } from "lucide-react";

import { useRouter } from "next/navigation";
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
const MAX_TXT_FILE_COUNT = 20;

type TxtFileKind = "HEADER" | "DETAIL" | "UNKNOWN";

interface TxtUploadFile {
  id: string;
  name: string;
  size: number;
  content: string;
  selectedKind: TxtFileKind;
  detectedKind: TxtFileKind;
  claimNumbers: string[];
  rowCount: number;
  parseNote: string;
}

interface TxtVerificationState {
  canProcessHeader: boolean;
  status: "IDLE" | "PASS" | "WARNING" | "BLOCKED";
  message: string;
  headerClaimNumbers: string[];
  detailClaimNumbers: string[];
  detailWithoutHeader: string[];
  headerWithoutDetail: string[];
}

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeClaimNumber(value: string | undefined): string | null {
  if (!value) return null;

  const cleaned = value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!cleaned || cleaned === "NULL" || cleaned === "N/A" || cleaned === "NA" || cleaned === "-") return null;
  if (cleaned.length < 3 || !/[0-9]/.test(cleaned)) return null;

  return cleaned.replace(/[^A-Z0-9/._-]/g, "");
}

function normalizeClaimColumnName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isClaimColumnName(value: string): boolean {
  const normalized = normalizeClaimColumnName(value);
  if (normalized.includes("claimtype") || normalized.includes("claimamount") || normalized.includes("claimdate")) return false;

  return [
    "claim",
    "claimid",
    "claimno",
    "claimnumber",
    "clmno",
    "noclaim",
    "noklaim",
    "nomorclaim",
    "nomorklaim",
    "nomerclaim",
    "nomerklaim",
  ].includes(normalized);
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let token = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"' && inQuotes) {
      token += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(token.trim());
      token = "";
    } else {
      token += char;
    }
  }

  result.push(token.trim());
  return result;
}

function detectDelimiter(lines: string[]): string | null {
  const delimiters = ["\t", "|", ";", ","];
  let selectedDelimiter: string | null = null;
  let bestScore = 0;

  for (const delimiter of delimiters) {
    const score = lines.slice(0, 10).reduce((total, line) => total + line.split(delimiter).length - 1, 0);
    if (score > bestScore) {
      bestScore = score;
      selectedDelimiter = delimiter;
    }
  }

  return bestScore > 0 ? selectedDelimiter : null;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function extractClaimNumbersFromText(text: string): string[] {
  const claimNumbers: string[] = [];
  const keyValuePattern = /^([^:=\t|]+)\s*[:=\t|]\s*(.+)$/gm;
  let keyValueMatch = keyValuePattern.exec(text);

  while (keyValueMatch) {
    const key = keyValueMatch[1] ?? "";
    const value = keyValueMatch[2] ?? "";
    if (isClaimColumnName(key)) {
      const claimNumber = normalizeClaimNumber(value);
      if (claimNumber) claimNumbers.push(claimNumber);
    }
    keyValueMatch = keyValuePattern.exec(text);
  }

  const explicitPattern = /\b(?:CLM|CLAIM|CN|KLAIM)[A-Z0-9][A-Z0-9/._-]{2,}\b/gi;
  let explicitMatch = explicitPattern.exec(text);
  while (explicitMatch) {
    const claimNumber = normalizeClaimNumber(explicitMatch[0]);
    if (claimNumber) claimNumbers.push(claimNumber);
    explicitMatch = explicitPattern.exec(text);
  }

  return uniqueSorted(claimNumbers);
}

function parseTxtClaimNumbers(content: string): Pick<TxtUploadFile, "claimNumbers" | "rowCount" | "parseNote"> {
  const lines = content.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { claimNumbers: [], rowCount: 0, parseNote: "File kosong." };
  }

  const delimiter = detectDelimiter(lines);
  if (!delimiter) {
    const claimNumbers = extractClaimNumbersFromText(content);
    return {
      claimNumbers,
      rowCount: lines.length,
      parseNote: claimNumbers.length > 0 ? "Nomor klaim dibaca dari teks bebas/key-value." : "Kolom nomor klaim belum ditemukan.",
    };
  }

  const rows = lines.map((line) => parseDelimitedLine(line, delimiter));
  const headerSearchLimit = Math.min(rows.length, 5);

  for (let rowIndex = 0; rowIndex < headerSearchLimit; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const claimColumnIndex = row.findIndex(isClaimColumnName);
    if (claimColumnIndex < 0) continue;

    const dataRows = rows.slice(rowIndex + 1).filter((candidate) => candidate.some((cell) => cell.trim().length > 0));
    const claimNumbers = dataRows
      .map((candidate) => normalizeClaimNumber(candidate[claimColumnIndex]))
      .filter((claimNumber): claimNumber is string => claimNumber !== null);

    return {
      claimNumbers: uniqueSorted(claimNumbers),
      rowCount: dataRows.length,
      parseNote: claimNumbers.length > 0 ? "Nomor klaim dibaca dari kolom header TXT." : "Kolom nomor klaim ada, tetapi nilai klaim belum valid.",
    };
  }

  const claimNumbers = extractClaimNumbersFromText(content);
  return {
    claimNumbers,
    rowCount: rows.length,
    parseNote: claimNumbers.length > 0 ? "Nomor klaim dibaca dari pola teks." : "Header kolom nomor klaim belum ditemukan.",
  };
}

function detectTxtFileKind(fileName: string, content: string): TxtFileKind {
  const sample = `${fileName}\n${content.slice(0, 1200)}`.toLowerCase();
  if (/\b(header|hdr|claim[_\s-]?header|klaim[_\s-]?header)\b/.test(sample)) return "HEADER";
  if (/\b(detail|dtl|rincian|claim[_\s-]?detail|klaim[_\s-]?detail)\b/.test(sample)) return "DETAIL";
  return "UNKNOWN";
}

function getTxtKindLabel(kind: TxtFileKind): string {
  if (kind === "HEADER") return "Header";
  if (kind === "DETAIL") return "Detail";
  return "Pilih tipe";
}

function buildTxtUploadFile(file: File, content: string, index: number): TxtUploadFile {
  const claimParsing = parseTxtClaimNumbers(content);
  const detectedKind = detectTxtFileKind(file.name, content);

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    name: file.name,
    size: file.size,
    content,
    selectedKind: detectedKind,
    detectedKind,
    claimNumbers: claimParsing.claimNumbers,
    rowCount: claimParsing.rowCount,
    parseNote: claimParsing.parseNote,
  };
}

function buildTxtVerification(files: TxtUploadFile[]): TxtVerificationState {
  const headerFiles = files.filter((file) => file.selectedKind === "HEADER");
  const detailFiles = files.filter((file) => file.selectedKind === "DETAIL");
  const unknownFiles = files.filter((file) => file.selectedKind === "UNKNOWN");
  const headerClaimNumbers = uniqueSorted(headerFiles.flatMap((file) => file.claimNumbers));
  const detailClaimNumbers = uniqueSorted(detailFiles.flatMap((file) => file.claimNumbers));
  const headerSet = new Set(headerClaimNumbers);
  const detailSet = new Set(detailClaimNumbers);
  const detailWithoutHeader = detailClaimNumbers.filter((claimNumber) => !headerSet.has(claimNumber));
  const headerWithoutDetail = detailClaimNumbers.length > 0 ? headerClaimNumbers.filter((claimNumber) => !detailSet.has(claimNumber)) : [];

  if (files.length === 0) {
    return { canProcessHeader: false, status: "IDLE", message: "Unggah minimal satu TXT header untuk OCR.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
  }

  if (unknownFiles.length > 0) {
    return { canProcessHeader: false, status: "BLOCKED", message: "Tentukan tipe Header atau Detail untuk semua file TXT.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
  }

  if (headerFiles.length === 0) {
    return { canProcessHeader: false, status: "BLOCKED", message: "TXT header wajib ada karena hanya header yang dipakai untuk komparasi PDF saat ini.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
  }

  if (headerClaimNumbers.length === 0) {
    return { canProcessHeader: false, status: "BLOCKED", message: "Nomor klaim pada TXT header belum terbaca.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
  }

  if (detailFiles.length > 0 && detailClaimNumbers.length === 0) {
    return { canProcessHeader: false, status: "BLOCKED", message: "TXT detail diunggah, tetapi nomor klaim detail belum terbaca.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
  }

  if (detailWithoutHeader.length > 0 || headerWithoutDetail.length > 0) {
    return { canProcessHeader: false, status: "BLOCKED", message: "Nomor klaim header dan detail belum sesuai.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
  }

  if (detailFiles.length === 0) {
    return { canProcessHeader: true, status: "WARNING", message: "TXT header siap dipakai untuk komparasi PDF. TXT detail belum diunggah, jadi verifikasi header-detail dilewati.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
  }

  return { canProcessHeader: true, status: "PASS", message: "TXT header dan detail sesuai. Komparasi PDF akan memakai TXT header saja.", headerClaimNumbers, detailClaimNumbers, detailWithoutHeader, headerWithoutDetail };
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
  const [txtFiles, setTxtFiles] = useState<TxtUploadFile[]>([]);
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
  const router = useRouter();

  const maxPdfSizeMb = useMemo(() => getClientMaxPdfSizeMb(), []);
  const maxPdfSizeBytes = maxPdfSizeMb * 1024 * 1024;
  const txtVerification = useMemo(() => buildTxtVerification(txtFiles), [txtFiles]);
  const primaryHeaderTxtFile = useMemo(
    () => txtFiles.find((file) => file.selectedKind === "HEADER") ?? null,
    [txtFiles],
  );

  const elapsedSeconds = useMemo(() => {
    if (!progress.startedAtMs || step !== "POLLING") return 0;
    return Math.max(0, Math.floor((nowMs - progress.startedAtMs) / 1000));
  }, [nowMs, progress.startedAtMs, step]);

  const handleUpload = async (): Promise<void> => {
    if (uploadInFlightRef.current) return;

    if (!pdfFile || !primaryHeaderTxtFile) {
      setError("Silakan unggah PDF invoice dan minimal satu TXT header.");
      return;
    }

    if (!txtVerification.canProcessHeader) {
      setError(txtVerification.message);
      return;
    }

    if (pdfFile.size > maxPdfSizeBytes) {
      setError(`Ukuran PDF melebihi batas ${maxPdfSizeMb}MB. Kompres atau pisahkan dokumen sebelum diunggah.`);
      return;
    }

    if (primaryHeaderTxtFile.size > MAX_TXT_SIZE_BYTES) {
      setError("Ukuran TXT header melebihi batas 2MB. Gunakan file ground truth yang lebih ringkas.");
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
        detail: "CONSUL sedang menghitung hash PDF dan menyiapkan TXT header sebagai acuan komparasi.",
      }));

      const [pdfHash, txtContent] = await Promise.all([
        calculateFileSha256(pdfFile),
        Promise.resolve(primaryHeaderTxtFile.content),
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
          txtName: primaryHeaderTxtFile.name,
          txtSize: primaryHeaderTxtFile.size,
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

  const handleForwarded = (claimJobId?: string): void => {
    console.log("Wizard handleForwarded called with claimJobId:", claimJobId);
    if (claimJobId) {
      window.location.href = `/dashboard/clinical-pathway/${claimJobId}`;
    } else {
      setStep("FORWARDED");
    }
  };

  const handlePdfFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setPdfFile(event.target.files?.[0] ?? null);
  };

  const handleTxtFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) return;

    if (txtFiles.length + selectedFiles.length > MAX_TXT_FILE_COUNT) {
      setError(`Maksimal ${MAX_TXT_FILE_COUNT} file TXT dalam satu unggahan OCR.`);
      return;
    }

    const oversizedFile = selectedFiles.find((file) => file.size > MAX_TXT_SIZE_BYTES);
    if (oversizedFile) {
      setError(`File ${oversizedFile.name} melebihi batas ${formatBytes(MAX_TXT_SIZE_BYTES)}.`);
      return;
    }

    try {
      setError(null);
      const parsedFiles = await Promise.all(
        selectedFiles.map(async (file, index) => buildTxtUploadFile(file, await file.text(), txtFiles.length + index)),
      );
      setTxtFiles((previousFiles) => [...previousFiles, ...parsedFiles]);
    } catch (readError: unknown) {
      setError(getErrorMessage(readError, "Gagal membaca file TXT."));
    }
  };

  const handleTxtKindChange = (fileId: string, event: ChangeEvent<HTMLSelectElement>): void => {
    const nextKind = event.target.value as TxtFileKind;
    setTxtFiles((previousFiles) => previousFiles.map((file) => (file.id === fileId ? { ...file, selectedKind: nextKind } : file)));
  };

  const handleRemoveTxtFile = (fileId: string): void => {
    setTxtFiles((previousFiles) => previousFiles.filter((file) => file.id !== fileId));
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
      <div className="mx-auto max-w-2xl border-b border-slate-200 pb-12 pt-4">
        <div className="flex justify-between items-start w-full relative">
          {WIZARD_STEPS.map((currentStep, index) => {
            const isActive = step === currentStep;
            const isPast = getStepIndex(step) > index;
            return (
              <div key={currentStep} className="flex-1 relative">
                {/* Line to next step */}
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`absolute top-4 left-1/2 w-full h-[2px] -translate-y-1/2 ${isPast ? "bg-green-200" : "bg-slate-200"}`} />
                )}
                
                {/* Step Content */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ring-4 ring-white ${
                    isActive ? "bg-sky-700 text-white" :
                    isPast ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
                  }`}>
                    {isPast ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <span className={`absolute top-10 text-xs font-medium whitespace-nowrap ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {currentStep === "POLLING" ? "Memproses OCR" : currentStep === "REVIEW" ? "Review & Koreksi" : currentStep === "FORWARDED" ? "Selesai" : "Unggah File"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {step === "UPLOAD" && (
        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-lg font-medium text-foreground">Unggah Invoice & TXT Klaim</h3>
            <p className="text-sm text-muted-foreground">Silakan unggah PDF invoice dan satu atau lebih TXT. Untuk saat ini komparasi OCR terhadap PDF hanya memakai TXT header; TXT detail dipakai untuk verifikasi nomor klaim terhadap header.</p>
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

              <div className={`relative flex flex-col items-center justify-center rounded-xl border border-slate-200 p-8 text-center transition-colors ${txtFiles.length > 0 ? 'bg-sky-50/50 border-sky-200' : 'bg-slate-50 hover:bg-slate-100/50'}`}>
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${txtFiles.length > 0 ? 'bg-sky-100 text-sky-600' : 'bg-white text-slate-400 shadow-sm border border-slate-100'}`}>
                  <FileIcon className="h-6 w-6" />
                </div>
                <h4 className="mb-1 text-sm font-medium text-foreground">TXT Header & Detail</h4>
                <p className="mb-5 text-xs text-muted-foreground">Upload satu atau lebih TXT/CSV klaim</p>
                
                <label className={`relative rounded-md bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm ring-1 ring-inset ring-slate-200 transition-colors ${isUploadLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                  <span>Pilih File</span>
                  <input
                    type="file"
                    accept="text/plain,.txt,.csv"
                    multiple
                    onChange={handleTxtFileChange}
                    disabled={isUploadLocked}
                    className="sr-only"
                  />
                </label>
                {txtFiles.length > 0 && <p className="mt-4 max-w-[220px] truncate text-xs font-medium text-sky-700">{txtFiles.length} file TXT dipilih</p>}
              </div>
            </div>

            <div className={`rounded-lg border p-4 ${txtVerification.status === "PASS" ? "border-green-200 bg-green-50" : txtVerification.status === "WARNING" ? "border-amber-200 bg-amber-50" : txtVerification.status === "BLOCKED" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className={`text-sm font-medium ${txtVerification.status === "PASS" ? "text-green-950" : txtVerification.status === "WARNING" ? "text-amber-950" : txtVerification.status === "BLOCKED" ? "text-red-950" : "text-slate-800"}`}>{txtVerification.message}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Header: {txtVerification.headerClaimNumbers.length} klaim · Detail: {txtVerification.detailClaimNumbers.length} klaim
                    {primaryHeaderTxtFile ? ` · Dipakai untuk OCR: ${primaryHeaderTxtFile.name}` : ""}
                  </p>
                </div>
                <span className="w-fit rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-600">
                  {txtVerification.status}
                </span>
              </div>
            </div>

            {txtFiles.length > 0 && (
              <div className="space-y-3">
                {txtFiles.map((txtUploadFile) => (
                  <div key={txtUploadFile.id} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-950">{txtUploadFile.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatBytes(txtUploadFile.size)} · {txtUploadFile.rowCount} baris · Deteksi: {getTxtKindLabel(txtUploadFile.detectedKind)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{txtUploadFile.parseNote}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(txtUploadFile.claimNumbers.length > 0 ? txtUploadFile.claimNumbers.slice(0, 5) : ["Nomor klaim belum terbaca"]).map((claimNumber) => (
                          <span key={claimNumber} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700">
                            {claimNumber}
                          </span>
                        ))}
                        {txtUploadFile.claimNumbers.length > 5 && (
                          <span className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-500">
                            +{txtUploadFile.claimNumbers.length - 5}
                          </span>
                        )}
                      </div>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Tipe</span>
                      <select
                        value={txtUploadFile.selectedKind}
                        onChange={(event) => handleTxtKindChange(txtUploadFile.id, event)}
                        disabled={isUploadLocked}
                        className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-base text-slate-950 outline-none transition-colors focus:border-sky-700 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                      >
                        <option value="UNKNOWN">Pilih tipe</option>
                        <option value="HEADER">Header</option>
                        <option value="DETAIL">Detail</option>
                      </select>
                    </label>

                    <div className="flex flex-col">
                      <span className="mb-1 hidden text-xs opacity-0 sm:block">Aksi</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTxtFile(txtUploadFile.id)}
                        disabled={isUploadLocked}
                        className="min-h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(txtVerification.detailWithoutHeader.length > 0 || txtVerification.headerWithoutDetail.length > 0) && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {txtVerification.detailWithoutHeader.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-medium text-red-950">Detail tanpa header</p>
                    <p className="mt-1 font-mono text-xs text-red-800">{txtVerification.detailWithoutHeader.join(", ")}</p>
                  </div>
                )}
                {txtVerification.headerWithoutDetail.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-950">Header tanpa detail</p>
                    <p className="mt-1 font-mono text-xs text-amber-800">{txtVerification.headerWithoutDetail.join(", ")}</p>
                  </div>
                )}
              </div>
            )}
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
