"use client";

import { useState, useEffect } from "react";
import PathwayTimeline from "./PathwayTimeline";
import { ArrowUp, BrainCircuit, Calculator, CheckCheck, CheckCircle2, ClipboardCheck, Copy, MinusCircle } from 'lucide-react';

export function ScoreCircularGauge({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let color = 'var(--color-primary-500, #14b8a6)';
  let glow = 'rgba(20, 184, 166, 0.25)';
  if (score < 50) {
    color = 'var(--color-danger-500, #ef4444)';
    glow = 'rgba(239, 68, 68, 0.25)';
  } else if (score < 80) {
    color = 'var(--color-warning-500, #f59e0b)';
    glow = 'rgba(245, 158, 11, 0.25)';
  }

  return (
    <div className="flex flex-col items-center justify-center relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ filter: `drop-shadow(0 4px 6px ${glow})` }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke="currentColor" className="text-border/40" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="transparent"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="font-extrabold text-text leading-none" style={{ fontSize: size * 0.23 }}>{score}</span>
        <span className="font-bold text-text-subtle uppercase tracking-wider mt-0.5" style={{ fontSize: size * 0.08 }}>Score</span>
      </div>
    </div>
  );
}

function ConformanceRow({ label, value, badgeLabel, isSuccess, isWarning }: { label: string; value: string; badgeLabel: string; isSuccess: boolean; isWarning?: boolean }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 bg-surface border border-border/60 rounded-md sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm font-medium text-text-subtle">{label}</span>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
        <span className="text-sm font-bold text-text">{value}</span>
        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${
          isSuccess ? 'bg-green-500/10 text-green-600 ring-1 ring-inset ring-green-500/20' :
          isWarning ? 'bg-yellow-500/10 text-yellow-600 ring-1 ring-inset ring-yellow-500/20' :
          'bg-red-500/10 text-red-600 ring-1 ring-inset ring-red-500/20'
        }`}>
          {badgeLabel}
        </span>
      </div>
    </div>
  );
}

type ScoreBreakdownItem = {
  label: string;
  maxDeduction: number;
  deducted: number;
  reason: string;
};

type LooseValidationItem = {
  status?: string;
  unmatchedProcedures?: unknown[];
};

type PersistedScoreBreakdownItem = {
  label: string;
  maxDeduction: number;
  deducted: number;
  reason: string;
};

function ScoreBreakdownPanel({ score, items }: { score: number; items: ScoreBreakdownItem[] }) {
  const totalDeduction = items.reduce((total, item) => total + item.deducted, 0);
  const calculatedScore = Math.max(0, 100 - totalDeduction);

  return (
    <div className="rounded-xl border border-border/70 bg-surface/95 p-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-subtle">
            <Calculator className="h-4 w-4 text-primary" />
            Perhitungan Skor
          </div>
          <p className="mt-1 text-sm text-text-subtle">Skor awal 100, dikurangi sesuai temuan validasi.</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border/60 bg-surface-elevated/30 text-center sm:min-w-[260px]">
          <div className="px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-subtle">Awal</p>
            <p className="text-lg font-extrabold text-text">100</p>
          </div>
          <div className="border-x border-border/60 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-subtle">Minus</p>
            <p className="text-lg font-extrabold text-red-600">-{totalDeduction}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-subtle">Akhir</p>
            <p className="text-lg font-extrabold text-primary">{Number.isFinite(score) ? score : calculatedScore}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((item) => {
          const hasDeduction = item.deducted > 0;
          return (
            <div key={item.label} className={`rounded-lg border p-3 ${hasDeduction ? 'border-red-500/20 bg-red-500/5' : 'border-green-500/20 bg-green-500/5'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {hasDeduction ? <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
                  <div>
                    <p className="text-sm font-bold text-text">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-text-subtle">{item.reason}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-extrabold ${hasDeduction ? 'bg-red-500/10 text-red-700' : 'bg-green-500/10 text-green-700'}`}>
                  {hasDeduction ? `-${item.deducted}` : '0'} / {item.maxDeduction}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PathwayResultViewer({ job: initialJob }: { job: any }) {
  const [job, setJob] = useState(initialJob);
  const [activeTab, setActiveTab] = useState("pathway");
  const [copied, setCopied] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Polling logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (job.status !== "COMPLETED" && job.status !== "FAILED") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/v1/jobs/${job.id}/status`);
          if (res.ok) {
            const data = await res.json();
            setJob((prev: any) => ({ ...prev, ...data }));
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [job.id, job.status]);

  if (job.status !== "COMPLETED" && job.status !== "FAILED") {
    // Processing UI
    return (
      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden p-12 text-center">
        <div className="mx-auto w-16 h-16 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin mb-6"></div>
        <h2 className="text-xl font-bold text-text mb-2">AI Brain is processing...</h2>
        <p className="text-text-subtle mb-8 max-w-md mx-auto">
          Analyzing claim data, validating procedures against Master Fee Schedule, checking drug prices, and compiling clinical pathway.
        </p>
        
        {/* Progress indicator */}
        <div className="max-w-xl mx-auto space-y-4 text-left">
          <div className="flex justify-between text-xs font-medium text-text-subtle mb-1">
            <span>Status</span>
            <span className="text-primary uppercase">{job.status}</span>
          </div>
          <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden">
            <div className={`bg-primary h-2 rounded-full transition-all duration-1000 ${
              job.status === "QUEUED" ? "w-1/4" : 
              job.status === "PRE_PROCESSING" ? "w-2/4" :
              job.status === "PROCESSING" ? "w-3/4" : "w-11/12"
            }`}></div>
          </div>
        </div>
      </div>
    );
  }

  if (job.status === "FAILED") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-red-800">Processing Failed</h3>
        <p className="text-sm text-red-600 mt-2 max-w-md mx-auto">{job.error || "Internal error occurred in AI Engine."}</p>
      </div>
    );
  }

  const result = job.outputResult || {};
  const validationScore = result.overallScore || result.validationScore || 0;
  const persistedLatencyMs = result.processingTime?.totalMs ?? result.processingTime?.total;
  const startedTime = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const completedTime = job.completedAt ? new Date(job.completedAt).getTime() : null;
  const workflowLatencyMs = typeof persistedLatencyMs === 'number' && persistedLatencyMs > 0
    ? persistedLatencyMs
    : startedTime && completedTime
      ? Math.max(0, completedTime - startedTime)
      : 0;
  const workflowLatencyText = workflowLatencyMs > 0 ? `${(workflowLatencyMs / 1000).toFixed(2)} detik` : 'Belum tersedia';
  const statusConfig = {
    VALID: { color: "success", label: "Valid" },
    INVALID: { color: "error", label: "Invalid" },
    WARNING: { color: "warning", label: "Warning" },
    REVIEW_NEEDED: { color: "warning", label: "Review Needed" }
  }[result.status as string] || { color: "neutral", label: "Unknown" };

  // Calculate some metrics for the cards
  const tariffItems = result.tariffValidation?.items || result.tariffValidations || [];
  const tariffOver = tariffItems.filter((t: any) => t.status === "OVER_THRESHOLD").length;
  
  const diagDetails = result.diagnosisValidation?.details || result.diagnosisValidations || [];
  const diagWarnings = diagDetails.reduce((acc: number, d: any) => acc + (d.missingRequiredProcedures?.length || 0), 0);
  
  const docDetails = result.documentValidation?.details || result.documentValidations || {};
  const docWarnings = docDetails.missingRequiredDocuments?.length || 0;

  const drugItems = result.drugPriceValidation?.items || result.drugPriceValidations || [];
  const drugIssues = (drugItems as LooseValidationItem[]).filter((d) => d.status && d.status !== "WITHIN_RANGE").length;
  const tariffIssues = (tariffItems as LooseValidationItem[]).filter((t) => t.status && t.status !== "WITHIN_RANGE").length;
  const unmatchedProcedures = (diagDetails as LooseValidationItem[]).reduce((acc, d) => acc + (d.unmatchedProcedures?.length || 0), 0);

  // Calculate detailed summary metrics
  const totalTariff = tariffItems.length;
  const passedTariff = tariffItems.filter((t: any) => t.status === "WITHIN_RANGE").length;
  const totalDrugs = drugItems.length;
  const passedDrugs = drugItems.filter((d: any) => d.status === "WITHIN_RANGE").length;
  const totalDiags = diagDetails.length;
  const passedDiags = diagDetails.filter((d: any) => !d.missingRequiredProcedures?.length && !d.unmatchedProcedures?.length).length;

  const totalItems = totalTariff + totalDrugs + totalDiags;
  const passedItems = passedTariff + passedDrugs + passedDiags;
  const aiPassRate = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 100;

  // Extract LOS details — fix: data is in inputPayload not inputData
  const inputPayload = job.inputPayload as any;
  const expectedLOSVal = result.clinicalPathway?.estimatedLos 
    || result.clinicalPathway?.recommendedPathway?.estimatedLos 
    || 0;
  const actualLOSVal = inputPayload?.extra?.los ? parseInt(inputPayload.extra.los) : 0;
  
  const losIsMissingActual = expectedLOSVal > 0 && actualLOSVal <= 0;
  const losIsOverstay = actualLOSVal > 0 && expectedLOSVal > 0 && actualLOSVal > expectedLOSVal;
  const losHasDeduction = losIsOverstay || losIsMissingActual;
  const varianceText = inputPayload?.extra?.outcomeNotes || "Tidak ada catatan varians";
  const diagnosisHasDeduction = result.diagnosisValidation ? !result.diagnosisValidation.isValid : false;
  const tariffHasDeduction = ["WARNING", "INVALID"].includes(result.tariffValidation?.status);
  const drugHasDeduction = ["WARNING", "INVALID"].includes(result.drugPriceValidation?.status);
  const documentHasDeduction = result.documentValidation ? !result.documentValidation.isValid : false;
  const hasUnregisteredTariff = (tariffItems as LooseValidationItem[]).some((item) => item.status === "NOT_FOUND");
  const hasUnregisteredDrug = (drugItems as LooseValidationItem[]).some((item) => item.status === "NOT_FOUND");
  const fallbackScoreBreakdown: ScoreBreakdownItem[] = [
    {
      label: "Diagnosis & tindakan klinis",
      maxDeduction: 25,
      deducted: diagnosisHasDeduction ? 25 : 0,
      reason: diagnosisHasDeduction
        ? `${diagWarnings} prosedur wajib belum ada, ${unmatchedProcedures} prosedur tidak sesuai pathway.`
        : "Diagnosis dan tindakan sesuai kebutuhan klinis utama.",
    },
    {
      label: "Tarif tindakan terdaftar",
      maxDeduction: 20,
      deducted: tariffHasDeduction ? 20 : 0,
      reason: tariffHasDeduction
        ? `${tariffIssues || tariffOver} item tindakan terdaftar melewati batas threshold.`
        : "Item tindakan yang terdaftar berada dalam threshold master fee schedule.",
    },
    {
      label: "Harga obat terdaftar",
      maxDeduction: 20,
      deducted: drugHasDeduction ? 20 : 0,
      reason: drugHasDeduction
        ? `${drugIssues} item obat terdaftar melewati threshold atau perlu review.`
        : "Item obat yang memiliki referensi harga berada dalam threshold."
    },
    {
      label: "Kelengkapan dokumen",
      maxDeduction: 10,
      deducted: documentHasDeduction ? 10 : 0,
      reason: documentHasDeduction
        ? `${docWarnings} dokumen wajib belum dilampirkan.`
        : "Dokumen medis wajib sudah lengkap.",
    },
    {
      label: "LOS compliance",
      maxDeduction: 10,
      deducted: losHasDeduction ? 10 : 0,
      reason: losIsMissingActual
        ? `LOS aktual tidak diisi. Standar AI memberi estimasi ${expectedLOSVal} hari, tetapi data input kosong sehingga perlu dilengkapi.`
        : losIsOverstay
          ? `LOS aktual ${actualLOSVal} hari melebihi standar pathway ${expectedLOSVal} hari.`
          : "LOS aktual sesuai standar pathway.",
    },
    {
      label: "Kesiapan master data",
      maxDeduction: 15,
      deducted: hasUnregisteredTariff || hasUnregisteredDrug ? 15 : 0,
      reason: hasUnregisteredTariff || hasUnregisteredDrug
        ? `${hasUnregisteredTariff ? "Ada tindakan yang belum tersedia di master tarif, sehingga belum bisa divalidasi harga. " : ""}${hasUnregisteredDrug ? "Ada obat yang belum ditemukan pada referensi harga, sehingga belum bisa divalidasi harga." : ""}`.trim()
        : "Semua tindakan dan obat tersedia pada master data/referensi.",
    },
  ];
  const persistedScoreItems = result.scoreBreakdown?.items as PersistedScoreBreakdownItem[] | undefined;
  const scoreBreakdown: ScoreBreakdownItem[] = Array.isArray(persistedScoreItems) && persistedScoreItems.length > 0
    ? persistedScoreItems.map((item) => ({
        label: item.label,
        maxDeduction: item.maxDeduction,
        deducted: item.deducted,
        reason: item.reason,
      }))
    : fallbackScoreBreakdown;

  const findClaimedProcedure = (item: any) => {
    const code = item.code || item.procedureCode;
    return (inputPayload?.procedures || []).find((procedure: any) => procedure.code === code || procedure.procedureCode === code || procedure.name === item.description || procedure.description === item.description);
  };

  const findClaimedMedication = (item: any) => {
    const name = String(item.name || item.medicationName || '').toLowerCase();
    return (inputPayload?.medications || []).find((medication: any) => String(medication.name || medication.medicationName || '').toLowerCase() === name);
  };

  const getProcedureClaimedTotal = (item: any) => {
    const claimed = findClaimedProcedure(item);
    return item.claimedTotal ?? item.claimedPrice ?? item.totalPrice ?? claimed?.totalPrice ?? claimed?.claimedTotal ?? ((item.claimedUnitPrice ?? item.unitPrice ?? claimed?.unitPrice ?? claimed?.price ?? 0) * (item.quantity ?? claimed?.quantity ?? 1));
  };

  const getProcedureClaimedUnit = (item: any) => {
    const claimed = findClaimedProcedure(item);
    return item.claimedUnitPrice ?? item.unitPrice ?? claimed?.unitPrice ?? claimed?.price ?? null;
  };

  const getDrugClaimedTotal = (item: any) => {
    const claimed = findClaimedMedication(item);
    return item.claimedTotal ?? item.totalPrice ?? claimed?.totalPrice ?? ((item.claimedUnitPrice ?? item.unitPrice ?? claimed?.unitPrice ?? claimed?.price ?? 0) * (item.quantity ?? claimed?.quantity ?? 1));
  };

  const getDrugClaimedUnit = (item: any) => {
    const claimed = findClaimedMedication(item);
    return item.claimedUnitPrice ?? item.unitPrice ?? claimed?.unitPrice ?? claimed?.price ?? null;
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={scrollToTop}
        className="fixed bottom-24 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-surface-elevated/95 text-text-subtle shadow-lg shadow-surface-accent/20 backdrop-blur transition-colors hover:bg-primary hover:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 lg:bottom-6 lg:right-6"
        aria-label="Kembali ke atas halaman"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
      {/* Hero Score Banner & Summary Panel */}
      <div className="rounded-xl border border-border/80 bg-surface shadow-sm overflow-hidden relative">
        <div className="p-6 border-b border-border/60 flex items-center justify-between bg-surface-elevated/20">
          <div>
            <h2 className="text-lg font-bold text-text flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              AI Outcome & Validation Summary
              {workflowLatencyMs > 0 && (
                <span className="text-xs font-mono text-text-subtle font-normal ml-2">
                  ({(workflowLatencyMs / 1000).toFixed(2)}s)
                </span>
              )}
            </h2>
            <p className="text-sm text-text-subtle mt-1">
              Hasil validasi item-by-item dari Brain AI — mencerminkan analisis tindakan, harga obat, dan kepatuhan pathway
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
            <ClipboardCheck className="w-3.5 h-3.5" />
            AI Verified
          </span>
        </div>
        
        <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 items-center bg-gradient-to-br from-surface to-primary/5">
          {/* Score Gauge */}
          <div className="flex flex-col items-center gap-4">
            <ScoreCircularGauge score={validationScore} size={140} />
            <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              statusConfig.color === 'success' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
              statusConfig.color === 'warning' ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20' :
              'bg-red-500/10 text-red-600 border border-red-500/20'
            }`}>
              {statusConfig.label}
            </span>
          </div>

          {/* Conformance Metrics */}
          <div className="space-y-4 w-full max-w-4xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-xs font-bold text-text-subtle uppercase tracking-wider">Perhitungan Skor & Metrik Kepatuhan</h3>
              <button
                onClick={handleCopyJSON}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text sm:min-h-0 sm:py-1.5"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Export JSON'}
              </button>
            </div>
            <ScoreBreakdownPanel score={validationScore} items={scoreBreakdown} />
            <ConformanceRow 
              label="Validasi Obat & Tindakan" 
              value={`${aiPassRate}% Sesuai`} 
              isSuccess={aiPassRate >= 80}
              isWarning={aiPassRate >= 50 && aiPassRate < 80}
              badgeLabel={aiPassRate >= 80 ? 'Sesuai Standar' : aiPassRate >= 50 ? 'Perlu Review' : 'Bermasalah'} 
            />
            <ConformanceRow 
              label="Length of Stay (LOS)"
              value={
                actualLOSVal > 0 && expectedLOSVal > 0
                  ? `${actualLOSVal} Hari Aktual — Standar AI: ${expectedLOSVal} Hari`
                  : actualLOSVal > 0 ? `${actualLOSVal} Hari (AI pathway belum dijalankan)`
                  : expectedLOSVal > 0 ? `Standar AI: ${expectedLOSVal} Hari (LOS aktual tidak diisi)`
                  : 'Data LOS tidak tersedia'
              }
              isSuccess={!losHasDeduction && (actualLOSVal > 0 || expectedLOSVal > 0)}
              isWarning={false}
              badgeLabel={
                actualLOSVal > 0 && expectedLOSVal > 0
                  ? (losIsOverstay ? `Overstay +${actualLOSVal - expectedLOSVal} hari` : 'Efisiensi Baik')
                  : losIsMissingActual ? 'Data Kurang' : 'Data Kurang'
              }
            />
            <ConformanceRow 
              label="Kelengkapan Dokumen Medis" 
              value={docWarnings === 0
                ? `${docDetails.providedDocuments?.length || 0} dokumen wajib dilampirkan`
                : `Mandatory document tidak terlampir: ${docDetails.missingRequiredDocuments?.join(', ')}`}
              isSuccess={docWarnings === 0}
              badgeLabel={docWarnings === 0 ? 'Lengkap' : `${docWarnings} Dokumen Hilang`} 
            />
            <ConformanceRow
              label="Waktu Workflow"
              value={`${workflowLatencyText} untuk 1x request clinical pathway`}
              isSuccess={workflowLatencyMs > 0 && workflowLatencyMs <= 60000}
              isWarning={workflowLatencyMs > 60000}
              badgeLabel={workflowLatencyMs > 0 ? 'Tercatat Real-time' : 'Tidak Tercatat'}
            />
            
            <div className="mt-4 p-4 bg-surface-elevated/40 rounded-lg border border-border/40">
              <span className="text-xs font-bold text-text-subtle uppercase tracking-wider block mb-1">Catatan Varians & Outcome</span>
              <p className="text-sm text-text font-medium italic">{varianceText}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area Tabs */}
      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border/80 overflow-x-auto bg-surface-elevated/20 hide-scrollbar">
          {[
            { id: "pathway", label: "Clinical Pathway" },
            { id: "tariff", label: "Fees & Drugs" },
            { id: "diagnosis", label: "Diagnosis & Docs" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id 
                  ? "border-primary text-primary bg-surface" 
                  : "border-transparent text-text-subtle hover:text-text hover:bg-surface-elevated/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="p-6 sm:p-8">
          
          {/* PATHWAY TAB — Patient Summary + Timeline */}
          {activeTab === "pathway" && (
            <div className="space-y-6 animate-fade-in">
              {/* Patient Clinical Summary Card */}
              {inputPayload && (
                <div className="rounded-lg border border-border/80 bg-surface-elevated/20 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-border/60 bg-surface-elevated/40">
                    <h3 className="text-sm font-bold text-text">Patient Clinical Summary</h3>
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {/* Identitas */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Patient Identity</p>
                      <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                        <span className="text-text-subtle font-medium">Name</span>
                        <span className="text-text font-semibold">{inputPayload.patient?.name || '—'}</span>
                        <span className="text-text-subtle font-medium">Gender/DOB</span>
                        <span className="text-text">{inputPayload.patient?.gender || '—'} · {inputPayload.patient?.birthDate ? new Date(inputPayload.patient.birthDate).toLocaleDateString('id-ID') : '—'}</span>
                        <span className="text-text-subtle font-medium">MRN</span>
                        <span className="text-text">{inputPayload.patient?.identifier?.[0]?.value || '—'}</span>
                        <span className="text-text-subtle font-medium">Insurance</span>
                        <span className="text-text">{inputPayload.extra?.insuranceNumber || '—'}</span>
                      </div>
                    </div>
                    {/* Episode */}
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Admission Episode</p>
                      <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                        <span className="text-text-subtle font-medium">Type</span>
                        <span className="text-text">{inputPayload.encounter?.class?.code || '—'}</span>
                        <span className="text-text-subtle font-medium">Admission</span>
                        <span className="text-text">{inputPayload.encounter?.period?.start ? new Date(inputPayload.encounter.period.start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                        <span className="text-text-subtle font-medium">Discharge</span>
                        <span className="text-text">{inputPayload.encounter?.period?.end ? new Date(inputPayload.encounter.period.end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                        <span className="text-text-subtle font-medium">LOS</span>
                        {actualLOSVal > 0 ? (
                          <span className="text-text font-semibold">{actualLOSVal} Days <span className="text-text-subtle font-normal">{expectedLOSVal > 0 ? `(AI Standard: ${expectedLOSVal} days)` : ''}</span></span>
                        ) : (
                          <span className="text-text">—</span>
                        )}
                      </div>
                    </div>
                    {/* Diagnoses */}
                    {inputPayload.diagnoses?.length > 0 && (
                      <div className="space-y-2 md:col-span-2">
                        <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Diagnoses</p>
                        <div className="flex flex-wrap gap-2">
                          {inputPayload.diagnoses.map((d: any, i: number) => (
                            <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                              d.type === 'primary' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-surface-elevated text-text-subtle border-border/60'
                            }`}>
                              <span className="font-mono font-bold">{d.code}</span>
                              {(d.description || d.name) && <span>— {d.description || d.name}</span>}
                              <span className="opacity-60">({d.type})</span>
                            </span>
                          ))}
                        </div>
                        {/* AI Clinical Summary */}
                        {result.diagnosisValidation?.details?.[0]?.clinicalSummary && (
                          <div className="mt-2 p-3 bg-primary/5 border border-primary/10 rounded-md">
                            <p className="text-xs font-bold text-primary mb-1">AI Clinical Context</p>
                            <p className="text-sm text-text-subtle italic">{result.diagnosisValidation.details[0].clinicalSummary}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Procedures & Medications summary */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Procedures Claimed ({inputPayload.procedures?.length || 0})</p>
                      <ul className="space-y-0.5">
                        {(inputPayload.procedures || []).slice(0, 5).map((p: any, i: number) => (
                          <li key={i} className="text-xs text-text-subtle">• <span className="font-mono">{p.code}</span>{p.name ? ` — ${p.name}` : ''}</li>
                        ))}
                        {inputPayload.procedures?.length > 5 && <li className="text-xs text-text-faint">+ {inputPayload.procedures.length - 5} more...</li>}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Medications Claimed ({inputPayload.medications?.length || 0})</p>
                      <ul className="space-y-0.5">
                        {(inputPayload.medications || []).slice(0, 5).map((m: any, i: number) => (
                          <li key={i} className="text-xs text-text-subtle">• {m.name}{m.quantity > 1 ? ` ×${m.quantity}` : ''}</li>
                        ))}
                        {inputPayload.medications?.length > 5 && <li className="text-xs text-text-faint">+ {inputPayload.medications.length - 5} more...</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-base font-bold text-text mb-4 flex items-center gap-2">
                  Recommended Treatment Pathway (AI)
                  {expectedLOSVal > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                      Day 1{expectedLOSVal > 1 ? ` - ${expectedLOSVal}` : ''}
                    </span>
                  )}
                </h3>
                <PathwayTimeline phases={job.clinicalPathway?.phases || result.clinicalPathway?.recommendedPathway || result.clinicalPathway?.phases || []} />
              </div>
            </div>
          )}

          {/* TARIFF & OBAT TAB */}
          {activeTab === "tariff" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h3 className="text-lg font-bold text-text mb-4">Master Fee Schedule Validation</h3>
                <div className="overflow-x-auto rounded-xl border border-border/80">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Procedure</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Total Claim (Rp)</th>
                        <th className="px-4 py-3 text-right">Total Master Max (Rp)</th>
                        <th className="px-4 py-3 text-right">Variance</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {tariffItems.map((item: any, i: number) => {
                        const isOver = item.status === "OVER_THRESHOLD";
                        const isUnder = item.status === "UNDER_PRICED";
                        const isNotFound = item.status === "NOT_FOUND";
                        const variancePct = item.variancePct ?? 0;
                        const claimedTotal = getProcedureClaimedTotal(item);
                        const claimedUnit = getProcedureClaimedUnit(item);
                        return (
                          <tr key={i} className={isOver ? "bg-red-500/5" : isNotFound || isUnder ? "bg-yellow-500/5" : ""}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-text">{item.description || findClaimedProcedure(item)?.name || findClaimedProcedure(item)?.description || item.procedureName || 'Tindakan medis'}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-text-subtle">
                              {item.quantity || 1}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="font-medium">{claimedTotal ? new Intl.NumberFormat('id-ID').format(claimedTotal) : '—'}</div>
                              {claimedUnit ? (
                                <div className="text-[10px] text-text-subtle font-normal mt-0.5">@ {new Intl.NumberFormat('id-ID').format(claimedUnit)}</div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="text-text-subtle font-medium">{item.expectedTotal > 0 ? new Intl.NumberFormat('id-ID').format(item.expectedTotal) : (item.masterMaxPrice || item.expectedMaxPrice ? new Intl.NumberFormat('id-ID').format((item.quantity || 1) * (item.masterMaxPrice || item.expectedMaxPrice)) : '—')}</div>
                              {item.masterMaxPrice || item.expectedMaxPrice ? (
                                <div className="text-[10px] text-text-subtle/70 font-normal mt-0.5">@ {new Intl.NumberFormat('id-ID').format(item.masterMaxPrice || item.expectedMaxPrice)}</div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {isNotFound ? '—' : (
                                <span className={variancePct > 0 ? 'text-red-500' : variancePct < -15 ? 'text-yellow-500' : 'text-green-600'}>
                                  {variancePct > 0 ? '+' : ''}{variancePct.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isOver ? (
                                <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-bold text-red-600 ring-1 ring-inset ring-red-500/20">⚠ Overcharge</span>
                              ) : isUnder ? (
                                <span className="inline-flex items-center rounded-md bg-yellow-500/10 px-2 py-1 text-xs font-bold text-yellow-600 ring-1 ring-inset ring-yellow-500/20">↓ Undercharge</span>
                              ) : isNotFound ? (
                                <span className="inline-flex items-center rounded-md bg-orange-500/10 px-2 py-1 text-xs font-bold text-orange-600 ring-1 ring-inset ring-orange-500/20">⚡ Unregistered</span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-500/20">✓ Compliant</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {tariffItems.some((t: any) => t.status === 'NOT_FOUND') && (
                  <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <p className="text-xs text-orange-700 font-medium">⚡ Beberapa tindakan berstatus <strong>Unregistered</strong> — belum terdaftar di Master Buku Tarif untuk provider ini. Harap daftarkan sebelum klaim diproses.</p>
                  </div>
                )}
              </div>

              {drugItems && drugItems.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-text mb-4">Drug Price Validation</h3>
                  <div className="overflow-x-auto rounded-xl border border-border/80">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Drug Name</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Total Claim (Rp)</th>
                          <th className="px-4 py-3 text-right">Total Market Max (Rp)</th>
                          <th className="px-4 py-3 text-right">Variance</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {drugItems.map((item: any, i: number) => {
                          const isDrugOver = item.status === "OVER_THRESHOLD" || item.status === "OVER_PRICED";
                          const isDrugUnder = item.status === "UNDER_PRICED";
                          const isDrugNotFound = item.status === "NOT_FOUND";
                          const drugVariancePct = item.variancePct ?? 0;
                          const drugClaimedTotal = getDrugClaimedTotal(item);
                          const drugClaimedUnit = getDrugClaimedUnit(item);
                          return (
                            <tr key={i} className={isDrugOver ? "bg-red-500/5" : isDrugNotFound || isDrugUnder ? "bg-yellow-500/5" : ""}>
                              <td className="px-4 py-3">
                                <p className="font-medium text-text">{item.name || item.medicationName}</p>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-text-subtle">
                                {item.quantity || 1}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="font-medium">{drugClaimedTotal ? new Intl.NumberFormat('id-ID').format(drugClaimedTotal) : '—'}</div>
                                {drugClaimedUnit ? (
                                  <div className="text-[10px] text-text-subtle font-normal mt-0.5">@ {new Intl.NumberFormat('id-ID').format(drugClaimedUnit)}</div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="text-text-subtle font-medium">{item.expectedTotal > 0 ? new Intl.NumberFormat('id-ID').format(item.expectedTotal) : (item.marketPriceMaxWithThreshold || item.marketMaxPrice ? new Intl.NumberFormat('id-ID').format((item.quantity || 1) * (item.marketPriceMaxWithThreshold || item.marketMaxPrice)) : '—')}</div>
                                {item.marketPriceMaxWithThreshold || item.marketMaxPrice ? (
                                  <div className="text-[10px] text-text-subtle/70 font-normal mt-0.5">@ {new Intl.NumberFormat('id-ID').format(item.marketPriceMaxWithThreshold || item.marketMaxPrice)}</div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {isDrugNotFound ? '—' : (
                                  <span className={drugVariancePct > 0 ? 'text-red-500' : drugVariancePct < -15 ? 'text-yellow-500' : 'text-green-600'}>
                                    {drugVariancePct > 0 ? '+' : ''}{drugVariancePct.toFixed(1)}%
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isDrugOver ? (
                                  <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-bold text-red-600 ring-1 ring-inset ring-red-500/20">⚠ Overcharge</span>
                                ) : isDrugUnder ? (
                                  <span className="inline-flex items-center rounded-md bg-yellow-500/10 px-2 py-1 text-xs font-bold text-yellow-600 ring-1 ring-inset ring-yellow-500/20">↓ Undercharge</span>
                                ) : isDrugNotFound ? (
                                  <span className="inline-flex items-center rounded-md bg-orange-500/10 px-2 py-1 text-xs font-bold text-orange-600 ring-1 ring-inset ring-orange-500/20">⚡ Unregistered</span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-500/20">✓ Compliant</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DIAGNOSIS & DOKUMEN TAB */}
          {activeTab === "diagnosis" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                              <h3 className="text-lg font-bold text-text mb-4">Diagnosis vs Procedure Validation</h3>
                <div className="space-y-4">
                  {diagDetails.map((diag: any, i: number) => (
                    <div key={i} className="rounded-xl border border-border/80 overflow-hidden">
                      {/* Diag header */}
                      <div className="flex items-start justify-between px-5 py-3.5 bg-surface-elevated/40 border-b border-border/60">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{diag.diagnosisCode}</span>
                            <h4 className="font-semibold text-text text-sm">{diag.diagnosisName || diag.diagnosisCode}</h4>
                          </div>
                          {diag.clinicalSummary && (
                            <p className="text-xs text-text-subtle mt-1.5 italic max-w-xl">{diag.clinicalSummary}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-5 space-y-3">
                        {diag.missingRequiredProcedures && diag.missingRequiredProcedures.length > 0 && (
                          <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-md">
                            <p className="text-xs font-bold text-orange-600 mb-1.5">Missing Required Procedures ({diag.missingRequiredProcedures.length})</p>
                            <ul className="space-y-0.5">
                              {diag.missingRequiredProcedures.map((p: string, j: number) => <li key={j} className="text-sm text-orange-700/80">• {p}</li>)}
                            </ul>
                          </div>
                        )}
                        
                        {diag.unmatchedProcedures && diag.unmatchedProcedures.length > 0 && (
                          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-md">
                            <p className="text-xs font-bold text-red-600 mb-1.5">Irrelevant Procedures for this Diagnosis ({diag.unmatchedProcedures.length})</p>
                            <ul className="space-y-0.5">
                              {diag.unmatchedProcedures.map((p: string, j: number) => <li key={j} className="text-sm text-red-700/80">• {p}</li>)}
                            </ul>
                          </div>
                        )}

                        {diag.suggestedProcedures && diag.suggestedProcedures.length > 0 && (
                          <div className="p-3 bg-primary/5 border border-primary/10 rounded-md">
                            <p className="text-xs font-bold text-primary mb-1.5">AI Suggested Procedures (Not Yet Claimed)</p>
                            <ul className="space-y-1.5">
                              {diag.suggestedProcedures.map((s: any, j: number) => (
                                <li key={j} className="text-sm">
                                  <span className="font-mono font-bold text-primary mr-1.5">{s.code}</span>
                                  <span className="text-primary">{s.name}</span>
                                  {s.rationale && <p className="text-xs text-primary/70 mt-0.5 ml-0">↳ {s.rationale}</p>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(!diag.missingRequiredProcedures?.length && !diag.unmatchedProcedures?.length) && (
                          <div className="flex items-center text-sm text-green-600">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            All procedures match the diagnosis.
                          </div>
                        )}
                        {diag.notes && (
                          <p className="text-xs text-text-subtle italic border-t border-border/40 pt-2 mt-2">AI Note: {diag.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-text mb-4">Document Completeness Validation</h3>
                <div className="rounded-xl border border-border/80 p-5 bg-surface-elevated/20">
                  {docDetails.missingRequiredDocuments?.length > 0 && (
                    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <p className="font-semibold text-red-800">Mandatory document tidak terlampir.</p>
                      <p className="mt-1">Admin perlu melengkapi atau meminta ulang dokumen berikut sebelum klaim diproses lebih lanjut: {docDetails.missingRequiredDocuments.join(', ')}.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-medium text-text mb-2">Attached Documents:</p>
                      {docDetails.providedDocuments?.length > 0 ? (
                        <ul className="space-y-1">
                          {docDetails.providedDocuments.map((doc: string, i: number) => (
                            <li key={i} className="text-sm text-text-subtle flex items-center">
                              <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                              {doc}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-text-subtle italic">None</p>
                      )}
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-text mb-2">Missing Required Documents:</p>
                      {docDetails.missingRequiredDocuments?.length > 0 ? (
                        <ul className="space-y-1">
                          {docDetails.missingRequiredDocuments.map((doc: string, i: number) => (
                            <li key={i} className="text-sm text-red-600 flex items-center">
                              <svg className="w-4 h-4 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                              {doc}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-green-600 flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                          All required documents fulfilled
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
