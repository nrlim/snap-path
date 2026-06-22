"use client";

import { useState, useCallback, useRef } from "react";
import { calculateLosDays } from "@/lib/los";

type Stage = "upload" | "processing" | "preview" | "error"; 
type ImportMode = "ai" | "direct";

interface MappedClaim {
  patient: any;
  encounter: any;
  diagnoses: any[];
  procedures: any[];
  medications: any[];
  documents: any[];
  extra: any;
  _mappingNotes?: string;
}

export default function PathwayImportModal({
  isOpen,
  onClose,
  onImport,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: any) => void;
}) {
  const [stage, setStage] = useState<Stage>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapped, setMapped] = useState<MappedClaim | null>(null);
  const [processingMsg, setProcessingMsg] = useState("Menganalisis struktur JSON...");
  const [importMode, setImportMode] = useState<ImportMode>("ai");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PROCESSING_MESSAGES = [
    "Menganalisis struktur JSON...",
    "AI sedang membaca field dari sumber data...",
    "Memetakan data pasien, tindakan, dan obat...",
    "Menormalkan format tanggal dan kode ICD-10...",
    "Memfinalisasi hasil pemetaan...",
  ];

  const getSnapPathSource = (rawJson: any) => rawJson?.claim || rawJson?.payload || rawJson;

  const isObject = (value: any) => value !== null && typeof value === "object" && !Array.isArray(value);

  const hasAnyStandardArray = (source: any) =>
    ["diagnoses", "procedures", "medications", "documents"].some((key) => Array.isArray(source?.[key]));

  const isStandardSnapPathJson = (rawJson: any) => {
    const source = getSnapPathSource(rawJson);
    if (!isObject(source)) return false;
    if (!isObject(source.patient) || !isObject(source.encounter)) return false;
    if (!hasAnyStandardArray(source)) return false;

    const arraysAreValid = ["diagnoses", "procedures", "medications", "documents"].every((key) =>
      source[key] === undefined || Array.isArray(source[key])
    );

    return arraysAreValid;
  };

  const normalizeDirectJson = (rawJson: any): MappedClaim => {
    const source = getSnapPathSource(rawJson);
    const procedures = Array.isArray(source?.procedures) ? source.procedures : [];
    const medications = Array.isArray(source?.medications) ? source.medications : [];

    const start = source?.encounter?.period?.start;
    const end = source?.encounter?.period?.end;
    let computedLos = source?.extra?.los;
    if (start && end) {
      const calc = calculateLosDays(start, end);
      if (calc > 0) computedLos = String(calc);
    }

    return {
      patient: source?.patient || {},
      encounter: source?.encounter || {},
      diagnoses: Array.isArray(source?.diagnoses) ? source.diagnoses : [],
      procedures: procedures.map((proc: any) => ({
        ...proc,
        name: proc.name || proc.description || proc.procedureName || proc.code || "",
        quantity: proc.quantity || 1,
        price: proc.price ?? proc.unitPrice ?? proc.claimedUnitPrice ?? 0,
        unitPrice: proc.unitPrice ?? proc.price ?? proc.claimedUnitPrice ?? 0,
        totalPrice: proc.totalPrice ?? proc.claimedTotal ?? ((proc.unitPrice ?? proc.price ?? proc.claimedUnitPrice ?? 0) * (proc.quantity || 1)),
      })),
      medications: medications.map((med: any) => ({
        ...med,
        name: med.name || med.medicationName || "",
        quantity: med.quantity || 1,
        price: med.price ?? med.unitPrice ?? med.claimedUnitPrice ?? 0,
        unitPrice: med.unitPrice ?? med.price ?? med.claimedUnitPrice ?? 0,
        totalPrice: med.totalPrice ?? med.claimedTotal ?? ((med.unitPrice ?? med.price ?? med.claimedUnitPrice ?? 0) * (med.quantity || 1)),
      })),
      documents: Array.isArray(source?.documents) ? source.documents : [],
      extra: { ...(source?.extra || {}), los: computedLos },
      _mappingNotes: "Struktur SnapPath terdeteksi. AI mapping dilewati dan data dibaca langsung dari key standar: patient, encounter, diagnoses, procedures, medications, documents, dan extra.",
    };
  };

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setStage("processing");

    // Cycle through loading messages
    let msgIdx = 0;
    setProcessingMsg(PROCESSING_MESSAGES[0]);
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % PROCESSING_MESSAGES.length;
      setProcessingMsg(PROCESSING_MESSAGES[msgIdx]);
    }, 1800);

    try {
      const text = await file.text();
      let rawJson: any;

      try {
        rawJson = JSON.parse(text);
      } catch {
        throw new Error("File bukan JSON yang valid. Pastikan format file sudah benar.");
      }

      if (isStandardSnapPathJson(rawJson)) {
        setImportMode("direct");
        setProcessingMsg("Struktur SnapPath valid. AI mapping dilewati...");
        clearInterval(msgInterval);
        setMapped(normalizeDirectJson(rawJson));
        setStage("preview");
        return;
      }

      setImportMode("ai");
      setProcessingMsg("JSON general terdeteksi. AI mapping dijalankan...");

      const res = await fetch("/api/v1/claims/map-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rawJson),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `AI mapping gagal (HTTP ${res.status})`);
      }

      const { mapped: result } = await res.json();
      clearInterval(msgInterval);
      setMapped(result);
      setStage("preview");
    } catch (err: any) {
      clearInterval(msgInterval);
      setError(err.message);
      setStage("error");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleConfirm = () => {
    if (!mapped) return;
    onImport(mapped);
    onClose();
    // Reset state
    setTimeout(() => {
      setStage("upload");
      setMapped(null);
      setError(null);
      setImportMode("ai");
    }, 300);
  };

  const handleReset = () => {
    setStage("upload");
    setMapped(null);
    setError(null);
    setImportMode("ai");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 backdrop-blur-sm">
      <div className="relative flex w-full max-w-2xl flex-col rounded-xl bg-surface shadow-2xl overflow-hidden border border-border/80 max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-medium text-text flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
              Smart JSON Import
            </h2>
            <p className="text-xs text-text-subtle mt-0.5">Upload JSON sekali. Struktur SnapPath dipakai langsung, JSON general otomatis dipetakan AI.</p>
          </div>
          <button onClick={onClose} className="p-2 text-text-subtle hover:text-text rounded-full hover:bg-surface-elevated transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Stage Indicator */}
        <div className="flex items-center gap-0 border-b border-border/60 px-6 flex-shrink-0">
          {[
            { id: "upload", label: "Upload" },
            { id: "processing", label: importMode === "ai" ? "AI Mapping" : "Direct Parse" },
            { id: "preview", label: "Preview & Confirm" },
          ].map((s, i, arr) => {
            const isActive = stage === s.id || (stage === "error" && s.id === "processing");
            const isPast =
              (stage === "processing" && i === 0) ||
              (stage === "preview" && i < 2) ||
              (stage === "error" && i === 0);
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center gap-1.5 py-3 px-2 text-xs font-medium transition-colors ${
                  isActive ? "text-primary border-b-2 border-primary" :
                  isPast ? "text-green-600" : "text-text-faint"
                }`}>
                  {isPast && !isActive && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                  {s.label}
                </div>
                {i < arr.length - 1 && <span className="text-border/60 mx-1">›</span>}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* STAGE: Upload */}
          {stage === "upload" && (
            <div className="p-6">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-xl border-2 border-dashed p-10 text-center transition-all flex flex-col items-center justify-center min-h-[220px] cursor-pointer ${
                  isDragging ? "border-primary bg-primary/5" : "border-border/80 bg-surface-elevated/20 hover:bg-surface-elevated/40 hover:border-border"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${isDragging ? "bg-primary/10" : "bg-surface-elevated"}`}>
                  <svg className={`w-7 h-7 ${isDragging ? "text-primary" : "text-text-subtle"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text mb-1">{isDragging ? "Lepaskan file di sini" : "Drag & drop JSON file"}</p>
                <p className="text-xs text-text-subtle mb-4">atau klik untuk memilih file · Format: .json</p>
                <div className="mb-4 w-full max-w-md rounded-xl border border-border/70 bg-surface/80 p-3 text-left text-xs text-text-subtle">
                  <p className="font-medium text-text">Auto-detect import</p>
                  <p className="mt-1 leading-relaxed">Jika JSON sudah memakai struktur SnapPath, data langsung dipakai tanpa request AI. Jika strukturnya general/custom, sistem otomatis menjalankan AI mapping.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-hover transition-colors pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  Pilih File JSON
                </div>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileInput} />
              </div>

              <div className="mt-4 rounded-lg bg-primary/5 border border-primary/15 p-4 text-xs text-text-subtle leading-relaxed">
                <p className="font-medium text-primary mb-1">Satu alur import</p>
                Struktur standar SnapPath diproses langsung. FHIR R4, HL7 v2, export SIMRS/SIRS custom, BPJS SEP, atau JSON hospital lain akan otomatis dipetakan dengan AI.
              </div>
            </div>
          )}

          {/* STAGE: Processing */}
          {stage === "processing" && (
            <div className="p-10 flex flex-col items-center justify-center min-h-[300px] gap-6">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium text-text mb-1">{importMode === "ai" ? "AI sedang memproses..." : "Membaca JSON secara langsung..."}</p>
                <p className="text-sm text-text-subtle animate-pulse">{importMode === "ai" ? processingMsg : "Menyalin field standar tanpa AI mapping"}</p>
              </div>
              <div className="text-xs text-text-faint text-center max-w-xs">
                {importMode === "ai" ? "AI menganalisis dan memetakan seluruh field dari JSON Anda ke struktur data klaim SnapPath" : "Tidak ada request AI. Pastikan JSON memiliki key standar agar preview terisi lengkap."}
              </div>
            </div>
          )}

          {/* STAGE: Preview */}
          {stage === "preview" && mapped && (
            <div className="p-6 space-y-5">
              {mapped._mappingNotes && (
                <div className="rounded-lg bg-primary/5 border border-primary/15 px-4 py-3 text-xs text-text-subtle">
                  <span className="font-medium text-primary">AI Mapping Notes: </span>
                  {mapped._mappingNotes}
                </div>
              )}

              {/* Patient Summary */}
              <div className="rounded-lg border border-border/80 overflow-hidden">
                <div className="bg-surface-elevated/50 px-4 py-2.5 border-b border-border/60">
                  <p className="text-xs font-medium text-text-subtle uppercase tracking-wider">Identitas Pasien</p>
                </div>
                <div className="px-4 py-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <span className="text-text-subtle">Nama</span><span className="font-medium text-text">{mapped.patient?.name || "—"}</span>
                  <span className="text-text-subtle">Tgl Lahir</span><span className="text-text">{mapped.patient?.birthDate || "—"}</span>
                  <span className="text-text-subtle">Gender</span><span className="text-text">{mapped.patient?.gender || "—"}</span>
                  <span className="text-text-subtle">MRN</span><span className="text-text font-mono">{mapped.patient?.identifier?.[0]?.value || "—"}</span>
                  <span className="text-text-subtle">No. Asuransi</span><span className="text-text">{mapped.extra?.insuranceNumber || "—"}</span>
                  <span className="text-text-subtle">LOS</span><span className="text-text">{mapped.extra?.los ? `${mapped.extra.los} hari` : "—"}</span>
                </div>
              </div>

              {/* Diagnoses */}
              {mapped.diagnoses?.length > 0 && (
                <div className="rounded-lg border border-border/80 overflow-hidden">
                  <div className="bg-surface-elevated/50 px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
                    <p className="text-xs font-medium text-text-subtle uppercase tracking-wider">Diagnosis</p>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{mapped.diagnoses.length} item</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {mapped.diagnoses.map((d, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">{d.code}</span>
                        <span className="flex-1 text-text">{d.name}</span>
                        <span className="text-xs text-text-faint capitalize">{d.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Procedures */}
              {mapped.procedures?.length > 0 && (
                <div className="rounded-lg border border-border/80 overflow-hidden">
                  <div className="bg-surface-elevated/50 px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
                    <p className="text-xs font-medium text-text-subtle uppercase tracking-wider">Tindakan / Prosedur</p>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{mapped.procedures.length} item</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {mapped.procedures.map((p, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs text-text-subtle">{p.code || "—"}</span>
                        <span className="flex-1 text-text">{p.name}</span>
                        <span className="text-xs text-text-subtle">Qty: {p.quantity || 1}</span>
                        {p.price ? <span className="text-xs font-mono text-text-subtle">Rp {new Intl.NumberFormat("id-ID").format(p.price)}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Medications */}
              {mapped.medications?.length > 0 && (
                <div className="rounded-lg border border-border/80 overflow-hidden">
                  <div className="bg-surface-elevated/50 px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
                    <p className="text-xs font-medium text-text-subtle uppercase tracking-wider">Obat / Medikamentosa</p>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{mapped.medications.length} item</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {mapped.medications.map((m, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                        <span className="flex-1 text-text">{m.name}</span>
                        <span className="text-xs text-text-subtle">Qty: {m.quantity || 1}</span>
                        {m.price ? <span className="text-xs font-mono text-text-subtle">Rp {new Intl.NumberFormat("id-ID").format(m.price)}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              {mapped.documents?.length > 0 && (
                <div className="rounded-lg border border-border/80 overflow-hidden">
                  <div className="bg-surface-elevated/50 px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
                    <p className="text-xs font-medium text-text-subtle uppercase tracking-wider">Dokumen Pendukung</p>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{mapped.documents.length} item</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {mapped.documents.map((d, i) => (
                      <div key={i} className="px-4 py-3 flex flex-col gap-1 text-sm">
                        <span className="font-medium text-text">{d.type}</span>
                        <span className="text-text-subtle text-xs">{d.conclusion || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAGE: Error */}
          {stage === "error" && (
            <div className="p-10 flex flex-col items-center justify-center min-h-[280px] gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-text mb-1">AI Mapping Gagal</p>
                <p className="text-sm text-text-subtle max-w-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border/80 bg-surface-elevated/10 px-6 py-4 flex-shrink-0">
          <button
            type="button"
            onClick={stage === "upload" ? onClose : handleReset}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text hover:bg-surface-elevated transition-colors focus:outline-none"
          >
            {stage === "upload" ? "Batal" : "← Upload Ulang"}
          </button>

          {stage === "preview" && (
            <button
              onClick={handleConfirm}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              Gunakan Data Ini →
            </button>
          )}
          {stage === "error" && (
            <button
              onClick={handleReset}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-hover transition-colors"
            >
              Coba Lagi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
