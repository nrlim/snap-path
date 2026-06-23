"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { Copy, Check } from "lucide-react";
import { JsonViewer } from "@/components/ui/JsonViewer";

import type { ScoringDetail, ScoringResult } from "@/lib/ocr-scoring";

interface OcrReviewTableProps {
  ocrJobId: string;
  scoringResult: ScoringResult;
  ocrRawResult?: unknown;
  txtItems?: unknown;
  txtContent?: string | null;
  onCorrected: (updatedScoring: ScoringResult) => void;
  onForward: () => void;
}

interface CorrectResponse {
  status?: string;
  matchScore?: number;
  scoringDetails?: ScoringDetail[];
  error?: string;
}

interface ForwardResponse {
  message?: string;
  error?: string;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function parseCorrectResponse(value: unknown): CorrectResponse {
  if (!isRecord(value)) return {};

  const details = Array.isArray(value.scoringDetails) ? value.scoringDetails.filter(isScoringDetail) : undefined;

  return {
    status: typeof value.status === "string" ? value.status : undefined,
    matchScore: typeof value.matchScore === "number" ? value.matchScore : undefined,
    scoringDetails: details,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

function parseForwardResponse(value: unknown): ForwardResponse {
  if (!isRecord(value)) return {};

  return {
    message: typeof value.message === "string" ? value.message : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}


function stripTxtInternalFields(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((item) => {
    if (!isRecord(item)) return item;
    const { rawValue: _rawValue, valueType: _valueType, ...rest } = item;
    void _rawValue;
    void _valueType;
    return rest;
  });
}

function formatSimilarity(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const CSV_HEADERS = [
  "Payor ID", "Corporate ID", "Policy Number", "Member ID", "NIK", "Branch Code", "Card No", "Member Name", "Claim ID", "Claim Type", "Claim Status", "Provider Code", "Admission Date", "Discharge Date", "Duration days", "Coverage ID", "Plan ID", "Disability No", "Diagnosis Code", "Secondary Diagnosis Code List", "Amt Incurred", "Amt Approved", "Amt Not Approved", "Amt ASO Approved", "on Plan / High Plan", "Remarks", "Provider Excess Paid", "Payor Invoice ID", "Hospital Invoice Date", "Hospital Invoice No", "Received Date", "Submission Date", "Verify By\\Approval"
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let token = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"' && inQuotes) {
      token += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(token.trim());
      token = "";
    } else {
      token += char;
    }
  }

  result.push(token.trim());
  return result;
}

export default function OcrReviewTable({
  ocrJobId,
  scoringResult,
  ocrRawResult,
  txtItems,
  txtContent,
  onCorrected,
  onForward,
}: OcrReviewTableProps): ReactElement {
  const [isForwarding, setIsForwarding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [isEditingJson, setIsEditingJson] = useState(false);
  const [editedJsonString, setEditedJsonString] = useState("");
  const [isSavingJson, setIsSavingJson] = useState(false);

  const [copiedOcr, setCopiedOcr] = useState(false);
  const [copiedTxt, setCopiedTxt] = useState(false);

  const handleCopy = async (data: unknown, type: "ocr" | "txt") => {
    try {
      const text = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(text);
      if (type === "ocr") {
        setCopiedOcr(true);
        setTimeout(() => setCopiedOcr(false), 2000);
      } else {
        setCopiedTxt(true);
        setTimeout(() => setCopiedTxt(false), 2000);
      }
    } catch (err) {
      console.error("Gagal menyalin text: ", err);
    }
  };

  // Corrections now handled via JSON Edit

  const handleSaveJson = async (): Promise<void> => {
    setIsSavingJson(true);
    setError(null);
    setMessage(null);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(editedJsonString);
    } catch (err) {
      setError("Gagal menyimpan: Syntax JSON tidak valid. Periksa kembali tanda kutip atau kurung kurawal Anda.");
      setIsSavingJson(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/ocr/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrJobId, ocrRawResult: parsedJson }),
      });
      const data = parseCorrectResponse(await res.json());

      if (!res.ok) throw new Error(data.error || "Gagal memperbarui raw JSON.");

      const details = data.scoringDetails ?? [];
      onCorrected({
        score: data.matchScore ?? 0,
        totalFields: details.length,
        matchedFields: details.filter((detail) => detail.match).length,
        details,
      });

      setIsEditingJson(false);
      setMessage("Data JSON Mentah berhasil diperbarui dan skor OCR telah dihitung ulang berdasarkan data terbaru.");
      // Note: we don't update local ocrRawResult state because it's passed via props from parent.
      // Parent should ideally re-fetch or we just let it be. Wait, if we edit JSON, we'd like to see it updated.
      // Since it's a prop, we should reload the window or let the user refresh, or just call an onReload prop.
      // Let's just reload the page to get the freshest data.
      window.location.reload();
    } catch (submissionError: unknown) {
      setError(submissionError instanceof Error ? submissionError.message : "Gagal memperbarui raw JSON.");
    } finally {
      setIsSavingJson(false);
    }
  };

  const handleForward = async (): Promise<void> => {
    setIsForwarding(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/v1/ocr/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrJobId }),
      });
      const data = parseForwardResponse(await res.json());

      if (!res.ok) throw new Error(data.error || "Gagal menandai data siap validasi klaim.");

      setMessage(data.message ?? "Data OCR siap untuk validasi klaim.");
      onForward();
    } catch (forwardError: unknown) {
      setError(forwardError instanceof Error ? forwardError.message : "Gagal menandai data siap validasi klaim.");
      setIsForwarding(false);
    }
  };

  const isPerfect = scoringResult.score === 100;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.14em] text-slate-500">Analisis OCR SnapText</p>
            <h3 className="mt-1 text-lg font-medium text-foreground">Skor Kesesuaian {scoringResult.score.toFixed(2)}%</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {scoringResult.matchedFields} dari {scoringResult.totalFields} field schema sesuai dengan TXT ground truth.
            </p>
          </div>

          {isPerfect && (
            <button
              type="button"
              onClick={handleForward}
              disabled={isForwarding}
              className="min-h-11 rounded-md bg-sky-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isForwarding ? "Menjalankan..." : "Jalankan Validasi Klaim"}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {Boolean(ocrRawResult || txtItems) && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="text-sm font-medium text-foreground">Komparasi Data Mentah</h4>
            <p className="text-xs text-muted-foreground">Bandingkan hasil OCR mentah dari SnapText dengan ground truth TXT Anda</p>
          </div>
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-700">Hasil Mentah OCR (JSON)</span>
                  {!isPerfect && ocrRawResult != null && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingJson) {
                          handleSaveJson();
                        } else {
                          setEditedJsonString(JSON.stringify(ocrRawResult, null, 2));
                          setIsEditingJson(true);
                        }
                      }}
                      disabled={isSavingJson}
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                        isEditingJson ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {isSavingJson ? "Menyimpan..." : isEditingJson ? "Simpan JSON" : "Edit JSON"}
                    </button>
                  )}
                  {isEditingJson && !isSavingJson && (
                    <button
                      type="button"
                      onClick={() => setIsEditingJson(false)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Batal
                    </button>
                  )}
                </div>
                {!isEditingJson && ocrRawResult != null && (
                  <button
                    onClick={() => handleCopy(ocrRawResult, "ocr")}
                    className="flex items-center gap-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-sky-700 focus:outline-none"
                    title="Copy JSON OCR"
                  >
                    {copiedOcr ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedOcr ? "Tersalin!" : "Salin"}</span>
                  </button>
                )}
              </div>
              <div className={`flex-1 overflow-auto bg-slate-950 p-4 max-h-[500px] ${isEditingJson ? "" : "scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"}`}>
                {isEditingJson ? (
                  <textarea
                    className="h-[400px] w-full resize-y bg-transparent p-0 font-mono text-[11px] leading-relaxed text-sky-300 focus:outline-none focus:ring-0"
                    value={editedJsonString}
                    onChange={(e) => setEditedJsonString(e.target.value)}
                    spellCheck={false}
                  />
                ) : ocrRawResult != null ? (
                  <JsonViewer 
                    data={ocrRawResult} 
                    fieldMatches={Object.fromEntries(
                      scoringResult.details
                        .filter(d => ["amount", "member_name", "invoice_number", "admission_date", "discharge_date"].includes(d.field))
                        .map(d => [d.field, d.match])
                    )}
                  />
                ) : (
                  <span className="text-[11px] leading-relaxed text-sky-300 font-mono">Data mentah OCR tidak tersedia.</span>
                )}
              </div>
            </div>

            <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-700">Ground Truth TXT (Parsed)</span>
                {txtItems != null && (
                  <button
                    onClick={() => {
                      handleCopy(stripTxtInternalFields(txtItems), "txt");
                    }}
                    className="flex items-center gap-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-sky-700 focus:outline-none"
                    title="Copy JSON TXT"
                  >
                    {copiedTxt ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedTxt ? "Tersalin!" : "Salin"}</span>
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-auto bg-slate-950 p-4 max-h-[500px]">
                {(() => {
                  let parsedCsvRow: string[] | null = null;
                  if (txtContent) {
                    const line = txtContent.trim();
                    if (line && !line.startsWith("{") && !line.startsWith("[")) {
                      const rows = line.split(/\r?\n/g).filter(Boolean);
                      for (const r of rows) {
                        const cols = parseCsvLine(r);
                        // Make sure we get a row that looks like values
                        if (cols.length >= 20 && cols[0] !== "Payor ID") {
                          parsedCsvRow = cols.map(c => c.replace(/\.00$/, ""));
                        }
                      }
                    }
                  }

                  if (parsedCsvRow && parsedCsvRow.length > 0) {
                    return (
                      <div className="rounded border border-slate-800 overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-sky-300 font-mono">
                          <thead className="bg-slate-900 text-sky-400">
                            <tr>
                              <th scope="col" className="px-3 py-2 font-semibold">Header</th>
                              <th scope="col" className="px-3 py-2 font-semibold border-l border-slate-800">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {CSV_HEADERS.map((header, idx) => (
                              <tr key={header} className="hover:bg-slate-900/50">
                                <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{header}</td>
                                <td className="px-3 py-2 border-l border-slate-800 break-all">{parsedCsvRow![idx] ?? "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  if (txtItems != null) {
                    return <JsonViewer data={stripTxtInternalFields(txtItems)} />;
                  }

                  return <span className="text-[11px] leading-relaxed text-green-300 font-mono">Data TXT tidak tersedia.</span>;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
