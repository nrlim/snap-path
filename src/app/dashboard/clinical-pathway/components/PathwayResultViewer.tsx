"use client";

import { useState, useEffect } from "react";
import PathwayTimeline from "./PathwayTimeline";
import { ArrowUp, BrainCircuit, Calculator, CheckCheck, CheckCircle2, ChevronDown, ClipboardCheck, Copy, MinusCircle } from 'lucide-react';
import { resolveActualLosDays } from '@/lib/los';

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

type ScoreBreakdownStatus = 'PASS' | 'PARTIAL' | 'NEEDS_REVIEW';

type ScoreBreakdownItem = {
  code?: string;
  label: string;
  maxDeduction: number;
  maxScore?: number;
  score?: number;
  deducted: number;
  status?: ScoreBreakdownStatus;
  reason: string;
};

type LooseValidationItem = {
  status?: string;
  unmatchedProcedures?: unknown[];
};

type PersistedScoreBreakdownItem = {
  code?: string;
  label: string;
  maxDeduction: number;
  maxScore?: number;
  score?: number;
  deducted: number;
  status?: ScoreBreakdownStatus;
  reason: string;
};

function ScoreBreakdownPanel({ score, items }: { score: number; items: ScoreBreakdownItem[] }) {
  const totalMaxScore = items.reduce((total, item) => total + (item.maxScore ?? item.maxDeduction), 0);
  const totalEarnedScore = items.reduce((total, item) => {
    const maxScore = item.maxScore ?? item.maxDeduction;
    const earnedScore = typeof item.score === 'number' ? item.score : Math.max(0, maxScore - item.deducted);
    return total + earnedScore;
  }, 0);
  const totalFindings = Math.max(0, totalMaxScore - totalEarnedScore);
  const calculatedScore = Math.max(0, Math.round(totalEarnedScore));

  return (
    <div className="rounded-xl border border-border/70 bg-surface/95 p-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-subtle">
            <Calculator className="h-4 w-4 text-primary" />
            Skor per Aspek
          </div>
          <p className="mt-1 text-sm text-text-subtle">Setiap aspek menampilkan poin yang diperoleh dari bobot maksimum, sehingga hasil lebih mudah dibaca.</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border/60 bg-surface-elevated/30 text-center sm:min-w-[300px]">
          <div className="px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-subtle">Maksimum</p>
            <p className="text-lg font-extrabold text-text">{totalMaxScore}</p>
          </div>
          <div className="border-x border-border/60 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-subtle">Diperoleh</p>
            <p className="text-lg font-extrabold text-primary">{Number.isFinite(score) ? score : calculatedScore}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-subtle">Temuan</p>
            <p className="text-lg font-extrabold text-amber-600">{totalFindings}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((item) => {
          const maxScore = item.maxScore ?? item.maxDeduction;
          const earnedScore = typeof item.score === 'number' ? item.score : Math.max(0, maxScore - item.deducted);
          const hasDeduction = item.deducted > 0;
          const isPartial = hasDeduction && earnedScore > 0;
          return (
            <div key={item.label} className={`rounded-lg border p-3 ${hasDeduction ? (isPartial ? 'border-amber-500/20 bg-amber-500/5' : 'border-red-500/20 bg-red-500/5') : 'border-green-500/20 bg-green-500/5'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {hasDeduction ? <MinusCircle className={`mt-0.5 h-4 w-4 shrink-0 ${isPartial ? 'text-amber-600' : 'text-red-600'}`} /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
                  <div>
                    <p className="text-sm font-bold text-text">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-text-subtle">{item.reason}</p>
                    {hasDeduction && <p className="mt-1 text-[11px] font-medium text-text-subtle">Pengurang: {item.deducted} poin</p>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-extrabold ${hasDeduction ? (isPartial ? 'bg-amber-500/10 text-amber-700' : 'bg-red-500/10 text-red-700') : 'bg-green-500/10 text-green-700'}`}>
                  {earnedScore} / {maxScore}
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
  const [copiedInput, setCopiedInput] = useState(false);
  const [loadingInput, setLoadingInput] = useState(false);
  const [expandedDiagnosisDetails, setExpandedDiagnosisDetails] = useState<Record<string, boolean>>({});

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleDiagnosisDetail = (key: string) => {
    setExpandedDiagnosisDetails((current) => ({ ...current, [key]: !(current[key] ?? false) }));
  };

  const isDiagnosisDetailExpanded = (key: string) => expandedDiagnosisDetails[key] ?? false;

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
  const persistedValidationScore = result.overallScore || result.validationScore || 0;
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
  const inputPayload = job.inputPayload as any;
  const tariffItems = result.tariffValidation?.items || result.tariffValidations || [];
  const tariffOver = tariffItems.filter((t: any) => t.status === "OVER_THRESHOLD").length;
  
  const diagDetails = result.diagnosisValidation?.details || result.diagnosisValidations || [];
  const diagWarnings = diagDetails.reduce((acc: number, d: any) => acc + (d.missingRequiredProcedures?.length || 0), 0);
  
  const docDetails = result.documentValidation?.details || result.documentValidations || {};
  const docWarnings = docDetails.missingRequiredDocuments?.length || 0;

  const inputMedications = Array.isArray(inputPayload?.medications) ? inputPayload.medications : [];
  const persistedDrugItems = result.drugPriceValidation?.items || result.drugPriceValidations || [];
  const drugItems = persistedDrugItems.length > 0
    ? persistedDrugItems
    : inputMedications.map((med: any) => {
      const quantity = Number(med.quantity || 1);
      const claimedUnitPrice = Number(med.unitPrice ?? med.price ?? med.claimedUnitPrice ?? 0);
      const claimedTotal = Number(med.totalPrice ?? med.claimedTotal ?? (claimedUnitPrice * quantity));
      return {
        name: med.name || med.medicationName || 'Obat',
        genericName: med.genericName || null,
        quantity,
        claimedUnitPrice,
        claimedTotal,
        marketPriceMax: 0,
        marketPriceMaxWithThreshold: 0,
        expectedTotal: 0,
        status: 'NOT_FOUND',
        variancePct: 0,
        sources: [],
        cachedAt: null,
      };
    });
  const registeredTariffItems = (tariffItems as LooseValidationItem[]).filter((t) => t.status !== "NOT_FOUND");
  const invalidRegisteredTariffItems = registeredTariffItems.filter((t) => t.status === "OVER_THRESHOLD" || t.status === "UNDER_PRICED");
  const invalidDrugItems = (drugItems as LooseValidationItem[]).filter((d) => d.status === "OVER_THRESHOLD" || d.status === "UNDER_PRICED" || d.status === "NOT_FOUND");
  const drugIssues = invalidDrugItems.length;
  const tariffIssues = invalidRegisteredTariffItems.length;
  const fallbackTariffDeduction = registeredTariffItems.length > 0 ? Math.min(20, Math.ceil((tariffIssues / registeredTariffItems.length) * 20)) : 0;
  const fallbackDrugDeduction = drugItems.length > 0 ? Math.min(20, Math.ceil((drugIssues / drugItems.length) * 20)) : 0;
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
  const losValidation = result.losValidation;
  const expectedLOSVal = losValidation?.expectedLos || result.clinicalPathway?.estimatedLos || result.clinicalPathway?.recommendedPathway?.estimatedLos || 0;
  const actualLOSVal = losValidation?.actualLos ?? resolveActualLosDays(inputPayload);
  
  const losIsMissingActual = losValidation?.status === "MISSING_ACTUAL" || (!losValidation && expectedLOSVal > 0 && actualLOSVal <= 0);
  const losIsOverstay = losValidation?.status === "OVERSTAY" || (!losValidation && actualLOSVal > 0 && expectedLOSVal > 0 && actualLOSVal > expectedLOSVal);
  const losIsUnderstay = losValidation?.status === "UNDERSTAY";
  const losHasDeduction = (losValidation?.deduction ?? 0) > 0 || (!losValidation && (losIsOverstay || losIsMissingActual));
  const varianceText = inputPayload?.extra?.outcomeNotes || "Tidak ada catatan varians";
  const diagnosisMissingRequiredCount = (diagDetails as any[]).reduce((total, detail) => total + (detail.missingRequiredProcedures?.length || 0), 0);
  const diagnosisReviewRelevanceCount = (diagDetails as any[]).reduce((total, detail) => total + (detail.irrelevantProcedures?.length || detail.unmatchedProcedures?.length || 0), 0);
  const diagnosisMedicationReviewCount = (diagDetails as any[]).reduce((total, detail) => total + (detail.medicationFindings?.filter((item: any) => item.status === 'REVIEW_NEEDED').length || 0), 0);
  const diagnosisMedicationInappropriateCount = (diagDetails as any[]).reduce((total, detail) => total + (detail.medicationFindings?.filter((item: any) => item.status === 'INAPPROPRIATE').length || 0), 0);
  const diagnosisMedicationIssueCount = diagnosisMedicationReviewCount + diagnosisMedicationInappropriateCount;
  const hasDiagnosisFindings = diagnosisMissingRequiredCount > 0 || diagnosisReviewRelevanceCount > 0 || diagnosisMedicationIssueCount > 0;
  const diagnosisHasDeduction = result.diagnosisValidation
    ? (!result.diagnosisValidation.isValid || hasDiagnosisFindings)
    : false;
  const fallbackDiagnosisDeduction = diagnosisHasDeduction
    ? Math.min(25, Math.max(1, Math.min(25, (diagnosisMissingRequiredCount * 5) + (diagnosisReviewRelevanceCount * 2) + (diagnosisMedicationReviewCount * 1) + (diagnosisMedicationInappropriateCount * 3))))
    : 0;
  const tariffHasDeduction = fallbackTariffDeduction > 0;
  const drugHasDeduction = fallbackDrugDeduction > 0;
  const documentHasDeduction = result.documentValidation ? !result.documentValidation.isValid : false;
  const hasUnregisteredTariff = (tariffItems as LooseValidationItem[]).some((item) => item.status === "NOT_FOUND");
  const hasDrugReferenceUnavailable = (drugItems as LooseValidationItem[]).some((item) => item.status === "NOT_FOUND");
  const fallbackScoreBreakdown: ScoreBreakdownItem[] = [
    {
      label: "Diagnosis, tindakan & obat klinis",
      maxDeduction: 25,
      deducted: fallbackDiagnosisDeduction,
      reason: diagnosisHasDeduction
        ? `Perlu review klinis: ${diagnosisMissingRequiredCount || diagWarnings} prosedur wajib belum diklaim, ${diagnosisReviewRelevanceCount || unmatchedProcedures} tindakan perlu review relevansi, dan ${diagnosisMedicationIssueCount} obat perlu review kesesuaian terhadap diagnosis.`
        : "Diagnosis, tindakan, dan obat sesuai kebutuhan klinis utama.",
    },
    {
      label: "Tarif tindakan terdaftar",
      maxDeduction: 20,
      deducted: fallbackTariffDeduction,
      reason: tariffHasDeduction
        ? `${tariffIssues || tariffOver}/${registeredTariffItems.length} item tindakan terdaftar tidak sesuai threshold. Pengurangan skor dihitung proporsional.`
        : "Item tindakan yang terdaftar berada dalam threshold master fee schedule.",
    },
    {
      label: "Harga obat referensi internet",
      maxDeduction: 20,
      deducted: fallbackDrugDeduction,
      reason: drugHasDeduction
        ? (hasDrugReferenceUnavailable ? `${drugIssues}/${drugItems.length} item obat perlu review; sebagian referensi harga internet belum dapat diverifikasi.` : `${drugIssues}/${drugItems.length} item obat melewati threshold atau jauh di bawah referensi.`)
        : "Item obat yang memiliki referensi harga internet berada dalam threshold."
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
      deducted: losValidation?.deduction ?? (losHasDeduction ? 10 : 0),
      reason: losValidation?.reason || (losIsMissingActual
        ? `LOS aktual tidak diisi. Standar AI memberi estimasi ${expectedLOSVal} hari, tetapi data input kosong sehingga perlu dilengkapi.`
        : losIsOverstay
          ? `LOS aktual ${actualLOSVal} hari melebihi standar pathway ${expectedLOSVal} hari.`
          : "LOS aktual sesuai standar pathway."),
    },
    {
      label: "Kesiapan master data",
      maxDeduction: 15,
      deducted: hasUnregisteredTariff ? 15 : 0,
      reason: hasUnregisteredTariff
        ? "Ada tindakan yang belum tersedia di master tarif, sehingga belum bisa divalidasi harga."
        : "Semua tindakan tersedia pada master data tarif."
    },
  ];
  const persistedScoreItems = result.scoreBreakdown?.items as PersistedScoreBreakdownItem[] | undefined;
  const normalizeScoreItem = (item: ScoreBreakdownItem): ScoreBreakdownItem => {
    const maxScore = item.maxScore ?? item.maxDeduction;
    const shouldClearHiddenDiagnosisDeduction = (item.code === 'DIAGNOSIS_TREATMENT' || item.label === 'Diagnosis, tindakan & obat klinis')
      && item.deducted > 0
      && result.diagnosisValidation?.isValid
      && !hasDiagnosisFindings;
    const deducted = shouldClearHiddenDiagnosisDeduction ? 0 : Math.max(0, item.deducted || 0);
    const earnedScore = shouldClearHiddenDiagnosisDeduction ? maxScore : (typeof item.score === 'number' ? item.score : Math.max(0, maxScore - deducted));
    return {
      ...item,
      maxScore,
      deducted,
      score: earnedScore,
      status: shouldClearHiddenDiagnosisDeduction ? 'PASS' : (item.status ?? (deducted === 0 ? 'PASS' : earnedScore > 0 ? 'PARTIAL' : 'NEEDS_REVIEW')),
      reason: shouldClearHiddenDiagnosisDeduction ? 'Diagnosis, tindakan, dan obat sesuai kebutuhan klinis utama.' : item.reason,
    };
  };
  const scoreBreakdown: ScoreBreakdownItem[] = Array.isArray(persistedScoreItems) && persistedScoreItems.length > 0
    ? persistedScoreItems.map((item) => normalizeScoreItem({
        code: item.code,
        label: item.label,
        maxDeduction: item.maxDeduction,
        maxScore: item.maxScore,
        score: item.score,
        deducted: item.deducted,
        status: item.status,
        reason: item.reason,
      }))
    : fallbackScoreBreakdown.map(normalizeScoreItem);
  const validationScore = scoreBreakdown.length > 0
    ? scoreBreakdown.reduce((total, item) => total + (item.score ?? Math.max(0, (item.maxScore ?? item.maxDeduction) - item.deducted)), 0)
    : persistedValidationScore;

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

  const getProcedureDisplayName = (item: any) => {
    const claimed = findClaimedProcedure(item);
    return item.description || item.procedureName || item.name || claimed?.name || claimed?.description || claimed?.procedureName || 'Tindakan medis';
  };

  const getProcedureDisplayCode = (item: any) => {
    const claimed = findClaimedProcedure(item);
    return item.code || item.procedureCode || claimed?.code || claimed?.procedureCode || null;
  };

  const getProcedureLine = (item: any) => {
    const name = item.procedureName || item.name || item.description || 'Tindakan medis';
    const code = item.procedureCode || item.code || null;
    return { name, code };
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

  const handleCopySanitizedInput = async () => {
    setLoadingInput(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/v1/jobs/${job.id}/sanitized-input`);
      if (!res.ok) throw new Error('Failed to fetch sanitized input');
      const data = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(data.sanitizedInput, null, 2));
      setCopiedInput(true);
      setTimeout(() => setCopiedInput(false), 2000);
    } catch (e) {
      console.error('Copy sanitized input error:', e);
    } finally {
      setLoadingInput(false);
    }
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
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySanitizedInput}
                  disabled={loadingInput}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text sm:min-h-0 sm:py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy input JSON yang dikirim ke AI (sudah disanitasi PII)"
                >
                  {copiedInput ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : loadingInput ? <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin inline-block" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedInput ? 'Copied!' : 'Copy AI Input'}
                </button>
                <button
                  onClick={handleCopyJSON}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text sm:min-h-0 sm:py-1.5"
                  title="Copy hasil output JSON dari AI"
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Export JSON'}
                </button>
              </div>
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
                losValidation ? (
                  losValidation.status === "NO_REFERENCE" ? `${actualLOSVal} Hari (Tanpa standar)`
                  : `${actualLOSVal} Hari Aktual — Standar ${losValidation.source === 'MASTER_DATA' ? 'Master' : 'AI'}: ${expectedLOSVal} Hari`
                )
                : actualLOSVal > 0 && expectedLOSVal > 0
                  ? `${actualLOSVal} Hari Aktual — Standar AI: ${expectedLOSVal} Hari`
                  : actualLOSVal > 0 ? `${actualLOSVal} Hari (AI pathway belum dijalankan)`
                  : expectedLOSVal > 0 ? `Standar AI: ${expectedLOSVal} Hari (LOS aktual tidak diisi)`
                  : 'Data LOS tidak tersedia'
              }
              isSuccess={!losHasDeduction && (actualLOSVal > 0 || expectedLOSVal > 0) && !losIsUnderstay}
              isWarning={losIsUnderstay || (losHasDeduction && !losIsOverstay && !losIsMissingActual)}
              badgeLabel={
                losValidation ? (
                  losValidation.status === "OVERSTAY" ? `Overstay +${losValidation.varianceDays} hari` :
                  losValidation.status === "UNDERSTAY" ? `Understay ${Math.abs(losValidation.varianceDays)} hari` :
                  losValidation.status === "COMPLIANT" && losValidation.varianceDays < 0 ? `Understay ${Math.abs(losValidation.varianceDays)} hari` :
                  losValidation.status === "COMPLIANT" ? "Sesuai Standar" :
                  losValidation.status === "MISSING_ACTUAL" ? "Data Kurang" :
                  "Tanpa Standar"
                ) :
                actualLOSVal > 0 && expectedLOSVal > 0
                  ? (losIsOverstay ? `Overstay +${actualLOSVal - expectedLOSVal} hari` : actualLOSVal < expectedLOSVal ? `Understay ${expectedLOSVal - actualLOSVal} hari` : 'Sesuai Standar')
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
            
            <div className="mt-4 p-4 bg-surface-elevated/40 rounded-lg border border-border/40 space-y-4">
              <div>
                <span className="text-xs font-bold text-text-subtle uppercase tracking-wider block mb-1">Catatan Varians & Outcome</span>
                <p className="text-sm text-text font-medium italic">{varianceText}</p>
              </div>
              {losValidation?.aiJustification && (
                <div className="border-t border-border/40 pt-3">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-1">Konteks Medis LOS (AI Analysis)</span>
                  <p className="text-sm text-text-subtle">{losValidation.aiJustification}</p>
                  {losValidation.references && losValidation.references.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {losValidation.references.map((ref: string, idx: number) => (
                        <span key={idx} className="inline-flex text-[10px] bg-surface border border-border px-1.5 py-0.5 rounded text-text-subtle">
                          {ref}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area Tabs */}
      <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border/80 overflow-x-auto bg-surface-elevated/20 hide-scrollbar">
          {[
            { id: "pathway", label: "Pathway Klinis" },
            { id: "tariff", label: "Biaya & Obat" },
            { id: "diagnosis", label: "Diagnosis & Dokumen" },
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
                    <h3 className="text-sm font-bold text-text">Ringkasan Klinis Pasien</h3>
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {/* Identitas */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Identitas Pasien</p>
                      <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                        <span className="text-text-subtle font-medium">Nama</span>
                        <span className="text-text font-semibold">{inputPayload.patient?.name || '—'}</span>
                        <span className="text-text-subtle font-medium">Gender/Tgl Lahir</span>
                        <span className="text-text">{inputPayload.patient?.gender || '—'} · {inputPayload.patient?.birthDate ? new Date(inputPayload.patient.birthDate).toLocaleDateString('id-ID') : '—'}</span>
                        <span className="text-text-subtle font-medium">MRN</span>
                        <span className="text-text">{inputPayload.patient?.identifier?.[0]?.value || '—'}</span>
                        <span className="text-text-subtle font-medium">Asuransi</span>
                        <span className="text-text">{inputPayload.extra?.insuranceNumber || '—'}</span>
                      </div>
                    </div>
                    {/* Episode */}
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Episode Perawatan</p>
                      <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                        <span className="text-text-subtle font-medium">Jenis</span>
                        <span className="text-text">{inputPayload.encounter?.class?.code || '—'}</span>
                        <span className="text-text-subtle font-medium">Masuk</span>
                        <span className="text-text">{inputPayload.encounter?.period?.start ? new Date(inputPayload.encounter.period.start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                        <span className="text-text-subtle font-medium">Pulang</span>
                        <span className="text-text">{inputPayload.encounter?.period?.end ? new Date(inputPayload.encounter.period.end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                        <span className="text-text-subtle font-medium">LOS</span>
                        {actualLOSVal > 0 ? (
                          <span className="text-text font-semibold">{actualLOSVal} Hari <span className="text-text-subtle font-normal">{expectedLOSVal > 0 ? `(Standar AI: ${expectedLOSVal} hari)` : ''}</span></span>
                        ) : (
                          <span className="text-text">—</span>
                        )}
                      </div>
                    </div>
                    {/* Diagnoses */}
                    {inputPayload.diagnoses?.length > 0 && (
                      <div className="space-y-2 md:col-span-2">
                        <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Diagnosis</p>
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
                            <p className="text-xs font-bold text-primary mb-1">Konteks Klinis AI</p>
                            <p className="text-sm text-text-subtle italic">{result.diagnosisValidation.details[0].clinicalSummary}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Procedures & Medications summary */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Tindakan Diklaim ({inputPayload.procedures?.length || 0})</p>
                      <ul className="space-y-0.5">
                        {(inputPayload.procedures || []).slice(0, 5).map((p: any, i: number) => {
                          const name = p.name || p.description || p.procedureName || 'Tindakan medis';
                          const code = p.code || p.procedureCode;
                          return <li key={i} className="text-xs text-text-subtle">• <span className="font-medium text-text">{name}</span>{code ? <span className="font-mono text-text-faint"> — {code}</span> : null}</li>;
                        })}
                        {inputPayload.procedures?.length > 5 && <li className="text-xs text-text-faint">+ {inputPayload.procedures.length - 5} lainnya...</li>}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Obat Diklaim ({inputPayload.medications?.length || 0})</p>
                      <ul className="space-y-0.5">
                        {(inputPayload.medications || []).slice(0, 5).map((m: any, i: number) => (
                          <li key={i} className="text-xs text-text-subtle">• {m.name}{m.quantity > 1 ? ` ×${m.quantity}` : ''}</li>
                        ))}
                        {inputPayload.medications?.length > 5 && <li className="text-xs text-text-faint">+ {inputPayload.medications.length - 5} lainnya...</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-base font-bold text-text mb-4 flex items-center gap-2">
                  Rekomendasi Pathway Terapi (AI)
                  {expectedLOSVal > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                      Hari 1{expectedLOSVal > 1 ? ` - ${expectedLOSVal}` : ''}
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
                              <p className="font-medium text-text">{getProcedureDisplayName(item)}</p>
                              {getProcedureDisplayCode(item) && <p className="mt-0.5 font-mono text-[10px] text-text-faint">{getProcedureDisplayCode(item)}</p>}
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
                                {item.resolvedProductName && (
                                  <p className="text-[10px] text-primary/80 mt-0.5">AI Match: {item.resolvedProductName}</p>
                                )}
                                {item.unitBasis && (
                                  <p className="text-[10px] text-text-subtle/70 mt-0.5">Unit: {item.unitBasis}</p>
                                )}
                                {Array.isArray(item.sources) && item.sources.length > 0 && (
                                  <p className="text-[10px] text-text-subtle/70 mt-0.5">Referensi internet: {item.sources.length} sumber</p>
                                )}
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
                                  <span className="inline-flex items-center rounded-md bg-orange-500/10 px-2 py-1 text-xs font-bold text-orange-600 ring-1 ring-inset ring-orange-500/20">Referensi belum tersedia</span>
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
                  {diagDetails.map((diag: any, i: number) => {
                    const diagnosisKey = `${diag.diagnosisCode || 'diagnosis'}-${i}`;
                    const isExpanded = isDiagnosisDetailExpanded(diagnosisKey);

                    return (
                    <div key={diagnosisKey} className="rounded-xl border border-border/80 overflow-hidden">
                      {/* Diag header */}
                      <div className="flex flex-col gap-3 px-5 py-3.5 bg-surface-elevated/40 border-b border-border/60 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{diag.diagnosisCode}</span>
                            <h4 className="font-semibold text-text text-sm">{diag.diagnosisName || diag.diagnosisCode}</h4>
                          </div>
                          {diag.clinicalSummary && isExpanded && (
                            <p className="text-xs text-text-subtle mt-1.5 italic max-w-xl">{diag.clinicalSummary}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDiagnosisDetail(diagnosisKey)}
                          aria-expanded={isExpanded}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {isExpanded ? 'Sembunyikan detail' : 'Tampilkan detail'}
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                      
                      {isExpanded && <div className="p-5 space-y-3">
                        {diag.missingRequiredProcedures && diag.missingRequiredProcedures.length > 0 && (
                          <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-md">
                            <p className="text-xs font-bold text-orange-600 mb-1.5">Prosedur wajib belum diklaim ({diag.missingRequiredProcedures.length})</p>
                            <p className="mb-2 text-xs leading-5 text-orange-700/80">Daftar ini hanya untuk prosedur yang dianggap wajib oleh mapping/pathway. Setiap item perlu dicek terhadap konteks klinis pasien.</p>
                            <ul className="space-y-2">
                              {diag.missingRequiredProcedures.map((p: string, j: number) => {
                                const detail = diag.missingRequiredProcedureDetails?.find((item: any) => p.includes(item.code) || item.code === p);
                                return (
                                  <li key={j} className="rounded-md bg-surface/70 p-2 text-sm text-orange-800">
                                    <p className="font-semibold">{detail?.name || p}</p>
                                    {detail?.code && <p className="mt-0.5 font-mono text-[11px] text-orange-700/70">{detail.code}</p>}
                                    {detail?.reason && <p className="mt-1 text-xs leading-5 text-orange-700/80">Alasan: {detail.reason}</p>}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                        
                        {diag.procedureFindings && diag.procedureFindings.length > 0 && (
                          <div className="p-3 bg-slate-500/5 border border-border/60 rounded-md">
                            <p className="text-xs font-bold text-text mb-1.5">Kesesuaian tindakan terhadap diagnosis ({diag.procedureFindings.length})</p>
                            <p className="mb-2 text-xs leading-5 text-text-subtle">Bagian ini menjelaskan apakah tindakan yang diklaim sesuai, perlu konteks tambahan, atau tidak sesuai terhadap diagnosis.</p>
                            <ul className="space-y-2">
                              {diag.procedureFindings.map((p: any, j: number) => {
                                const isIssue = p.status === 'REVIEW_NEEDED' || p.status === 'INAPPROPRIATE';
                                return (
                                  <li key={j} className={`rounded-md bg-surface/70 p-2 text-sm ${isIssue ? 'text-amber-800' : 'text-green-800'}`}>
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                      <div>
                                        <p className="font-semibold">{getProcedureLine(p).name}</p>
                                        {getProcedureLine(p).code && <p className="mt-0.5 font-mono text-[11px] opacity-70">{getProcedureLine(p).code}</p>}
                                      </div>
                                      <span className={`w-fit rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.status === 'APPROPRIATE' ? 'bg-green-500/10 text-green-700' : p.status === 'INAPPROPRIATE' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>
                                        {p.status === 'APPROPRIATE' ? 'Sesuai' : p.status === 'INAPPROPRIATE' ? 'Tidak sesuai' : 'Perlu review'}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs leading-5 opacity-80">Alasan: {p.reason}</p>
                                    <p className="mt-1 text-[11px] opacity-70">Dinilai terhadap: {p.againstDiagnosis || diag.diagnosisCode} · Keyakinan: {p.confidence === 'HIGH' ? 'Tinggi' : p.confidence === 'MEDIUM' ? 'Sedang' : 'Rendah'}</p>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {((diag.irrelevantProcedures && diag.irrelevantProcedures.length > 0) || (diag.unmatchedProcedures && diag.unmatchedProcedures.length > 0)) && (
                          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-md">
                            <p className="text-xs font-bold text-red-600 mb-1.5">Tindakan perlu review relevansi ({(diag.irrelevantProcedures?.length || diag.unmatchedProcedures?.length || 0)})</p>
                            <p className="mb-2 text-xs leading-5 text-red-700/80">Tindakan di bawah ini hanya ditandai jika AI memberi alasan klinis spesifik. Tidak relevan berarti tidak ada hubungan jelas terhadap diagnosis yang dinilai.</p>
                            <ul className="space-y-2">
                              {(diag.irrelevantProcedures?.length ? diag.irrelevantProcedures : diag.unmatchedProcedures).map((item: any, j: number) => {
                                const isDetailed = typeof item === 'object' && item !== null;
                                return (
                                  <li key={j} className="rounded-md bg-surface/70 p-2 text-sm text-red-800">
                                    {isDetailed ? (
                                      <div>
                                        <p className="font-semibold">{getProcedureLine(item).name}</p>
                                        {getProcedureLine(item).code && <p className="mt-0.5 font-mono text-[11px] text-red-700/70">{getProcedureLine(item).code}</p>}
                                      </div>
                                    ) : (
                                      <p className="font-semibold">{String(item).split(':')[0]}</p>
                                    )}
                                    {isDetailed ? (
                                      <div className="mt-1 space-y-1 text-xs leading-5 text-red-700/80">
                                        <p>Alasan: {item.reason}</p>
                                        <p>Dinilai terhadap: {item.againstDiagnosis || diag.diagnosisCode}</p>
                                        <p>Keyakinan AI: {item.confidence === 'HIGH' ? 'Tinggi' : 'Sedang'}</p>
                                      </div>
                                    ) : String(item).includes(':') ? (
                                      <p className="mt-1 text-xs leading-5 text-red-700/80">Alasan: {String(item).split(':').slice(1).join(':').trim()}</p>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {diag.medicationFindings && diag.medicationFindings.length > 0 && (
                          <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-md">
                            <p className="text-xs font-bold text-blue-700 mb-1.5">Kesesuaian obat terhadap diagnosis ({diag.medicationFindings.length})</p>
                            <p className="mb-2 text-xs leading-5 text-blue-700/80">Bagian ini menilai apakah obat yang diklaim selaras dengan diagnosis, termasuk terapi utama, suportif, simptomatik, antibiotik, cairan, atau obat komorbid.</p>
                            <ul className="space-y-2">
                              {diag.medicationFindings.map((m: any, j: number) => {
                                const isIssue = m.status === 'REVIEW_NEEDED' || m.status === 'INAPPROPRIATE';
                                return (
                                  <li key={j} className={`rounded-md bg-surface/70 p-2 text-sm ${isIssue ? 'text-amber-800' : 'text-green-800'}`}>
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                      <p className="font-semibold">{m.medicationName}{m.genericName ? ` (${m.genericName})` : ''}</p>
                                      <span className={`w-fit rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.status === 'APPROPRIATE' ? 'bg-green-500/10 text-green-700' : m.status === 'INAPPROPRIATE' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>
                                        {m.status === 'APPROPRIATE' ? 'Sesuai' : m.status === 'INAPPROPRIATE' ? 'Tidak sesuai' : 'Perlu review'}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs leading-5 opacity-80">Alasan: {m.reason}</p>
                                    <p className="mt-1 text-[11px] opacity-70">Dinilai terhadap: {m.againstDiagnosis || diag.diagnosisCode} · Keyakinan AI: {m.confidence === 'HIGH' ? 'Tinggi' : 'Sedang'}</p>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {diag.suggestedProcedures && diag.suggestedProcedures.length > 0 && (
                          <div className="p-3 bg-primary/5 border border-primary/10 rounded-md">
                            <p className="text-xs font-bold text-primary mb-1.5">Saran tindakan tambahan AI, belum diklaim</p>
                            <p className="mb-2 text-xs leading-5 text-primary/75">Saran ini bersifat pendukung/advisory, bukan otomatis wajib. Gunakan untuk review apakah tindakan tambahan memang diperlukan.</p>
                            <ul className="space-y-2">
                              {diag.suggestedProcedures.map((s: any, j: number) => (
                                <li key={j} className="rounded-md bg-surface/70 p-2 text-sm">
                                  <p className="font-semibold text-primary">{s.name || 'Tindakan medis'}</p>
                                  {s.code && <p className="mt-0.5 font-mono text-[11px] text-primary/65">{s.code}</p>}
                                  {s.rationale && <p className="mt-1 text-xs leading-5 text-primary/70">Alasan saran: {s.rationale}</p>}
                                  {s.evidenceLevel && <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-primary/60">Level: {s.evidenceLevel === 'COMMON' ? 'Umum pada pathway' : 'Opsional sesuai indikasi'}</p>}
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
                      </div>}
                    </div>
                    );
                  })}
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
