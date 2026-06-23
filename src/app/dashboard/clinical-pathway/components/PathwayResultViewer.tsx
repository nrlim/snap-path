"use client";

import { useState, useEffect } from "react";
import PathwayTimeline from "./PathwayTimeline";
import { ArrowUp, BrainCircuit, BookOpen, Calculator, CheckCheck, CheckCircle2, ChevronDown, ClipboardCheck, Copy, MinusCircle, FileText, Pill, Stethoscope } from 'lucide-react';
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
        <span className="font-extrabold text-foreground leading-none" style={{ fontSize: size * 0.23 }}>{score}</span>
        <span className="font-medium text-muted-foreground uppercase tracking-wider mt-0.5" style={{ fontSize: size * 0.08 }}>Score</span>
      </div>
    </div>
  );
}

function ConformanceRow({ label, value, badgeLabel, isSuccess, isWarning }: { label: string; value: string; badgeLabel: string; isSuccess: boolean; isWarning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/60 last:border-0">
      <span className="text-sm font-light text-muted-foreground shrink-0">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
        <span className="text-sm font-light text-foreground text-right">{value}</span>
        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] rounded ${
          isSuccess ? 'bg-green-500/10 text-green-700 ring-1 ring-inset ring-green-500/20' :
          isWarning ? 'bg-yellow-500/10 text-yellow-700 ring-1 ring-inset ring-yellow-500/20' :
          'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'
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
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Header with totals */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          Skor per Aspek
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Maks: <span className="font-mono text-foreground font-light">{totalMaxScore}</span></span>
          <span className="text-muted-foreground">Diperoleh: <span className="font-mono text-primary font-light">{Number.isFinite(score) ? score : calculatedScore}</span></span>
          <span className="text-muted-foreground">Temuan: <span className="font-mono text-amber-600 font-light">{totalFindings}</span></span>
        </div>
      </div>
      {/* Score items as compact rows */}
      <div className="divide-y divide-border/60">
        {items.map((item) => {
          const maxScore = item.maxScore ?? item.maxDeduction;
          const earnedScore = typeof item.score === 'number' ? item.score : Math.max(0, maxScore - item.deducted);
          const hasDeduction = item.deducted > 0;
          const isPartial = hasDeduction && earnedScore > 0;
          return (
            <div key={item.label} className="flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70">
              <div className="mt-0.5 shrink-0">
                {hasDeduction
                  ? <MinusCircle className={`h-3.5 w-3.5 ${isPartial ? 'text-amber-500' : 'text-red-500'}`} />
                  : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-light text-foreground">{item.label}</p>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-mono tabular-nums font-light ${
                    hasDeduction
                      ? (isPartial ? 'bg-amber-500/10 text-amber-700' : 'bg-red-500/10 text-red-700')
                      : 'bg-green-500/10 text-green-700'
                  }`}>
                    {earnedScore}/{maxScore}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.reason}</p>
                {hasDeduction && <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">−{item.deducted} poin</p>}
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
    setExpandedDiagnosisDetails((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  };

  const isDiagnosisDetailExpanded = (key: string) => expandedDiagnosisDetails[key] ?? true;

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
    return (
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden p-12 text-center">
        <div className="mx-auto w-16 h-16 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin mb-6"></div>
        <h2 className="text-xl font-light text-foreground mb-2">AI Brain is processing...</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Analyzing claim data, validating procedures against Master Fee Schedule, checking drug prices, and compiling clinical pathway.
        </p>
        
        {/* Progress indicator */}
        <div className="max-w-xl mx-auto space-y-4 text-left">
          <div className="flex justify-between text-xs font-light text-muted-foreground mb-1">
            <span>Status</span>
            <span className="text-primary uppercase">{job.status}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
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
        <h3 className="text-lg font-medium text-red-800">Processing Failed</h3>
        <p className="text-sm text-red-600 mt-2 max-w-md mx-auto">{job.error || "Internal error occurred in AI Engine."}</p>
      </div>
    );
  }

  const result = job.outputResult || {};
  const policyValidation = result.policyValidation || null;
  const policyFindings = policyValidation?.findings || [];
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
        referencedAt: null,
      };
    });
  const registeredTariffItems = (tariffItems as LooseValidationItem[]).filter((t) => t.status !== "NOT_FOUND");
  const invalidRegisteredTariffItems = registeredTariffItems.filter((t) => t.status === "OVER_THRESHOLD" || t.status === "UNDER_PRICED");
  const invalidDrugItems = (drugItems as LooseValidationItem[]).filter((d) => d.status === "OVER_THRESHOLD" || d.status === "UNDER_PRICED");
  const drugIssues = invalidDrugItems.length;
  const missingTariffMasterItems = (tariffItems as LooseValidationItem[]).filter((item) => item.status === "NOT_FOUND");
  const missingDrugMasterItems = (drugItems as LooseValidationItem[]).filter((item) => item.status === "NOT_FOUND");
  const masterDataItemCount = tariffItems.length + drugItems.length;
  const missingMasterDataCount = missingTariffMasterItems.length + missingDrugMasterItems.length;
  const fallbackMasterDataDeduction = masterDataItemCount > 0 ? Math.min(15, Math.ceil((missingMasterDataCount / masterDataItemCount) * 15)) : 0;
  const tariffIssues = invalidRegisteredTariffItems.length;
  const fallbackTariffDeduction = registeredTariffItems.length > 0 ? Math.min(20, Math.ceil((tariffIssues / registeredTariffItems.length) * 20)) : 0;
  const fallbackDrugDeduction = drugItems.length > 0 ? Math.min(20, Math.ceil((drugIssues / drugItems.length) * 20)) : 0;
  const unmatchedProcedures = (diagDetails as LooseValidationItem[]).reduce((acc, d) => acc + (d.unmatchedProcedures?.length || 0), 0);

  const totalTariff = tariffItems.length;
  const passedTariff = tariffItems.filter((t: any) => t.status === "WITHIN_RANGE").length;
  const totalDrugs = drugItems.length;
  const passedDrugs = drugItems.filter((d: any) => d.status === "WITHIN_RANGE").length;
  const totalDiags = diagDetails.length;
  const passedDiags = diagDetails.filter((d: any) => !d.missingRequiredProcedures?.length && !d.unmatchedProcedures?.length).length;

  const totalItems = totalTariff + totalDrugs + totalDiags;
  const passedItems = passedTariff + passedDrugs + passedDiags;
  const aiPassRate = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 100;

  const losValidation = result.losValidation;
  const expectedLOSVal = losValidation?.expectedLos || result.clinicalPathway?.estimatedLos || result.clinicalPathway?.recommendedPathway?.estimatedLos || 0;
  const actualLOSVal = losValidation?.actualLos ?? resolveActualLosDays(inputPayload);
  
  const losIsMissingActual = losValidation?.status === "MISSING_ACTUAL" || (!losValidation && expectedLOSVal > 0 && actualLOSVal <= 0);
  const losIsOverstay = losValidation?.status === "OVERSTAY" || (!losValidation && actualLOSVal > 0 && expectedLOSVal > 0 && actualLOSVal > expectedLOSVal);
  const losIsUnderstay = losValidation?.status === "UNDERSTAY";
  const losHasDeduction = (losValidation?.deduction ?? 0) > 0 || (!losValidation && (losIsOverstay || losIsMissingActual));
  const varianceText = inputPayload?.extra?.outcomeNotes || "Tidak ada catatan varians";
  const normalizeProcedureKey = (value: unknown) => String(value || '').trim().toUpperCase();
  const episodeAppropriateProcedureKeys = new Set<string>();
  const episodeAppropriateMedicationKeys = new Set<string>();
  for (const detail of diagDetails as any[]) {
    for (const finding of detail.procedureFindings || []) {
      if (finding.status === 'APPROPRIATE') episodeAppropriateProcedureKeys.add(normalizeProcedureKey(finding.procedureCode || finding.procedureName));
    }
    for (const procedure of detail.matchedProcedures || []) {
      episodeAppropriateProcedureKeys.add(normalizeProcedureKey(String(procedure).split('—')[0] || procedure));
    }
    for (const finding of detail.medicationFindings || []) {
      if (finding.status === 'APPROPRIATE') episodeAppropriateMedicationKeys.add(String(finding.medicationName || finding.genericName || '').trim().toLowerCase());
    }
  }
  const uniqueMissingRequired = new Set<string>();
  const uniqueReviewProcedures = new Set<string>();
  const uniqueReviewMedications = new Set<string>();
  const uniqueInappropriateMedications = new Set<string>();
  for (const detail of diagDetails as any[]) {
    for (const item of detail.missingRequiredProcedures || []) uniqueMissingRequired.add(String(item));
    for (const item of detail.irrelevantProcedures || []) {
      const key = normalizeProcedureKey(item.procedureCode || item.procedureName || item);
      if (!episodeAppropriateProcedureKeys.has(key)) uniqueReviewProcedures.add(key);
    }
    for (const item of detail.unmatchedProcedures || []) {
      const key = normalizeProcedureKey(String(item).split('—')[0] || item);
      if (!episodeAppropriateProcedureKeys.has(key)) uniqueReviewProcedures.add(key);
    }
    for (const item of detail.medicationFindings || []) {
      const key = String(item.medicationName || item.name || item.genericName || '').trim().toLowerCase();
      if (!key || episodeAppropriateMedicationKeys.has(key)) continue;
      if (item.status === 'INAPPROPRIATE') uniqueInappropriateMedications.add(key);
      else if (item.status === 'REVIEW_NEEDED') uniqueReviewMedications.add(key);
    }
  }
  const diagnosisMissingRequiredCount = uniqueMissingRequired.size;
  const diagnosisReviewRelevanceCount = uniqueReviewProcedures.size;
  const diagnosisMedicationReviewCount = uniqueReviewMedications.size;
  const diagnosisMedicationInappropriateCount = uniqueInappropriateMedications.size;
  const diagnosisMedicationIssueCount = diagnosisMedicationReviewCount + diagnosisMedicationInappropriateCount;
  const claimedProcedureCount = Array.isArray(inputPayload?.procedures) ? inputPayload.procedures.length : 0;
  const claimedMedicationCount = Array.isArray(inputPayload?.medications) ? inputPayload.medications.length : 0;
  const hasDiagnosisFindings = diagnosisMissingRequiredCount > 0 || diagnosisReviewRelevanceCount > 0 || diagnosisMedicationIssueCount > 0;
  const missingRequiredDenominator = claimedProcedureCount + diagnosisMissingRequiredCount;
  const missingRequiredDeduction = missingRequiredDenominator > 0 ? (diagnosisMissingRequiredCount / missingRequiredDenominator) * 8 : 0;
  const procedureRelevanceDeduction = claimedProcedureCount > 0 ? (diagnosisReviewRelevanceCount / claimedProcedureCount) * 8 : (diagnosisReviewRelevanceCount > 0 ? 8 : 0);
  const medicationRelevanceDeduction = claimedMedicationCount > 0 ? (((diagnosisMedicationReviewCount * 0.5) + diagnosisMedicationInappropriateCount) / claimedMedicationCount) * 9 : (diagnosisMedicationIssueCount > 0 ? 9 : 0);
  const diagnosisHasDeduction = hasDiagnosisFindings;
  const fallbackDiagnosisDeduction = diagnosisHasDeduction
    ? Math.min(25, Math.ceil(missingRequiredDeduction + procedureRelevanceDeduction + medicationRelevanceDeduction))
    : 0;
  const tariffHasDeduction = fallbackTariffDeduction > 0;
  const drugHasDeduction = fallbackDrugDeduction > 0;
  const documentHasDeduction = result.documentValidation ? !result.documentValidation.isValid : false;
  const hasMissingMasterData = missingMasterDataCount > 0;
  const fallbackScoreBreakdown: ScoreBreakdownItem[] = [
    {
      label: "Diagnosis, tindakan & obat klinis",
      maxDeduction: 25,
      deducted: fallbackDiagnosisDeduction,
      reason: diagnosisHasDeduction
        ? `Perlu review klinis: ${diagnosisMissingRequiredCount || diagWarnings} prosedur wajib belum diklaim, ${diagnosisReviewRelevanceCount || unmatchedProcedures}/${claimedProcedureCount} tindakan perlu review relevansi, dan ${diagnosisMedicationIssueCount}/${claimedMedicationCount} obat perlu review kesesuaian terhadap diagnosis. Pengurangan dihitung proporsional terhadap total tindakan dan obat yang diinput.`
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
      label: "Harga obat/farmalkes referensi master",
      maxDeduction: 20,
      deducted: fallbackDrugDeduction,
      reason: drugHasDeduction
        ? `${drugIssues}/${drugItems.length} item obat/farmalkes melewati threshold atau jauh di bawah referensi master.`
        : "Item obat/farmalkes yang memiliki referensi master berada dalam threshold."
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
      deducted: fallbackMasterDataDeduction,
      reason: hasMissingMasterData
        ? `${missingMasterDataCount}/${masterDataItemCount} item tindakan/obat belum tersedia pada master data/referensi lokal (${missingTariffMasterItems.length} tindakan, ${missingDrugMasterItems.length} obat/farmalkes). Pengurangan dihitung proporsional.`
        : "Semua tindakan dan obat/farmalkes tersedia pada master data/referensi lokal."
    },
  ];
  const persistedScoreItems = result.scoreBreakdown?.items as PersistedScoreBreakdownItem[] | undefined;
  const normalizeScoreItem = (item: ScoreBreakdownItem): ScoreBreakdownItem => {
    const maxScore = item.maxScore ?? item.maxDeduction;
    const shouldClearHiddenDiagnosisDeduction = (item.code === 'DIAGNOSIS_TREATMENT' || item.label === 'Diagnosis, tindakan & obat klinis')
      && item.deducted > 0
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
  const idrFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

  const toFiniteNumber = (value: unknown): number | null => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  const formatIdrAmount = (value: number) => idrFormatter.format(Math.round(Math.abs(value)));

  const formatVarianceAmount = (value: number) => {
    const prefix = value > 0 ? '+Rp ' : value < 0 ? '−Rp ' : 'Rp ';
    return `${prefix}${formatIdrAmount(value)}`;
  };

  const getItemQuantity = (item: { quantity?: unknown }) => {
    const quantity = toFiniteNumber(item.quantity);
    return quantity !== null && quantity > 0 ? quantity : 1;
  };

  const getPriceVariance = (claimedTotal: number | null, masterTotal: number | null) => {
    if (claimedTotal === null || masterTotal === null) return null;
    return claimedTotal - masterTotal;
  };

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

  const getProcedureMasterTotal = (item: Record<string, unknown>) => {
    const expectedTotal = toFiniteNumber(item.expectedTotal);
    if (expectedTotal !== null && expectedTotal > 0) return expectedTotal;

    const masterUnitPrice = toFiniteNumber(item.masterMaxPrice ?? item.expectedMaxPrice);
    return masterUnitPrice !== null && masterUnitPrice > 0 ? masterUnitPrice * getItemQuantity(item) : null;
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

  const getDrugMasterTotal = (item: Record<string, unknown>) => {
    const masterUnitPrice = toFiniteNumber(item.marketPriceMax ?? item.maxReferencePrice ?? item.marketMaxPrice);
    if (masterUnitPrice !== null && masterUnitPrice > 0) return masterUnitPrice * getItemQuantity(item);

    const expectedTotal = toFiniteNumber(item.expectedTotal);
    return expectedTotal !== null && expectedTotal > 0 ? expectedTotal : null;
  };

  interface PriceSummary {
    totalClaimed: number;
    totalExpected: number;
    variance: number;
    variancePct: number;
  }

  const buildPriceSummary = (
    section: Record<string, unknown> | null | undefined,
    items: Array<Record<string, unknown>>,
    getClaimedTotal: (item: Record<string, unknown>) => unknown,
    getMasterTotal: (item: Record<string, unknown>) => number | null,
  ): PriceSummary | null => {
    const persistedClaimed = toFiniteNumber(section?.totalClaimed);
    const persistedExpected = toFiniteNumber(section?.totalExpected);
    if (persistedClaimed !== null && persistedExpected !== null) {
      const persistedVariance = toFiniteNumber(section?.variance) ?? persistedClaimed - persistedExpected;
      const persistedVariancePct = toFiniteNumber(section?.variancePct) ?? (persistedExpected > 0 ? (persistedVariance / persistedExpected) * 100 : 0);
      return {
        totalClaimed: persistedClaimed,
        totalExpected: persistedExpected,
        variance: persistedVariance,
        variancePct: persistedVariancePct,
      };
    }

    if (items.length === 0) return null;

    const totals = items.reduce<{ totalClaimed: number; totalExpected: number }>(
      (currentTotals, item) => {
        const claimedTotal = toFiniteNumber(getClaimedTotal(item)) ?? 0;
        const masterTotal = getMasterTotal(item) ?? 0;
        return {
          totalClaimed: currentTotals.totalClaimed + claimedTotal,
          totalExpected: currentTotals.totalExpected + masterTotal,
        };
      },
      { totalClaimed: 0, totalExpected: 0 },
    );
    const variance = totals.totalClaimed - totals.totalExpected;
    const variancePct = totals.totalExpected > 0 ? (variance / totals.totalExpected) * 100 : 0;

    return { ...totals, variance, variancePct };
  };

  const renderPriceSummary = (summary: PriceSummary) => {
    const varianceClass = summary.variance > 0 ? 'text-red-600' : summary.variance < 0 ? 'text-yellow-600' : 'text-green-600';
    return (
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Total Klaim</p>
          <p className="mt-1 font-mono text-sm font-light text-foreground">Rp {idrFormatter.format(summary.totalClaimed)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Total Master Data</p>
          <p className="mt-1 font-mono text-sm font-light text-foreground">Rp {idrFormatter.format(summary.totalExpected)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Selisih Agregat</p>
          <p className={`mt-1 font-mono text-sm font-light ${varianceClass}`}>{formatVarianceAmount(summary.variance)}</p>
          <p className={`mt-0.5 font-mono text-[10px] ${varianceClass}`}>{summary.variancePct > 0 ? '+' : ''}{summary.variancePct.toFixed(1)}%</p>
        </div>
      </div>
    );
  };

  const tariffPriceSummary = buildPriceSummary(
    result.tariffValidation,
    tariffItems as Array<Record<string, unknown>>,
    getProcedureClaimedTotal,
    getProcedureMasterTotal,
  );
  const drugPriceSummary = buildPriceSummary(
    result.drugPriceValidation,
    drugItems as Array<Record<string, unknown>>,
    getDrugClaimedTotal,
    getDrugMasterTotal,
  );

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

  const tabs = [
    { id: "pathway", label: "Pathway Klinis", icon: <Stethoscope className="h-4 w-4" /> },
    { id: "tariff", label: "Biaya & Obat", icon: <Pill className="h-4 w-4" /> },
    { id: "policy", label: "Polis & Benefit", icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: "diagnosis", label: "Diagnosis & Dokumen", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-0">
      {/* Scroll to top button */}
      <button
        type="button"
        onClick={scrollToTop}
        className="fixed bottom-24 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-primary hover:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 lg:bottom-6 lg:right-6"
        aria-label="Kembali ke atas halaman"
      >
        <ArrowUp className="h-5 w-5" />
      </button>

      {/* ── SECTION 1: Score & Summary Banner ─────────────────────────── */}
      <div className="overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-sm">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white"><BrainCircuit className="w-4 h-4" /></span>
            <h2 className="text-sm font-light text-foreground">AI Outcome & Validation Summary</h2>
            {workflowLatencyMs > 0 && (
              <span className="text-xs font-mono text-muted-foreground">
                ({(workflowLatencyMs / 1000).toFixed(2)}s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-[0.15em] ${
              statusConfig.color === 'success' ? 'bg-green-500/10 text-green-700 border border-green-500/20' :
              statusConfig.color === 'warning' ? 'bg-yellow-500/10 text-yellow-700 border border-yellow-500/20' :
              'bg-red-500/10 text-red-700 border border-red-500/20'
            }`}>
              <ClipboardCheck className="w-3 h-3" />
              {statusConfig.label}
            </span>
          </div>
        </div>

        {/* Score row: gauge left, conformance rows right */}
        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-[200px_1fr] lg:divide-x lg:divide-y-0">
          {/* Score gauge column */}
          <div className="flex flex-col items-center justify-center gap-3 bg-slate-50/60 p-6">
            <ScoreCircularGauge score={validationScore} size={130} />
            <p className="text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground text-center">Skor Validasi</p>
          </div>

          {/* Conformance metrics column */}
          <div className="bg-white px-6 py-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Metrik Kepatuhan</p>
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
            {/* Variance note */}
            <div className="mt-3 pt-3 border-t border-border/60">
              <span className="text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground">Catatan Varians</span>
              <p className="mt-1 text-sm font-light text-foreground italic">{varianceText}</p>
            </div>
            {losValidation?.aiJustification && (
              <div className="mt-3 pt-3 border-t border-border/60">
                <span className="text-xs font-mono uppercase tracking-[0.15em] text-primary">Konteks Medis LOS (AI)</span>
                <p className="mt-1 text-sm text-muted-foreground">{losValidation.aiJustification}</p>
                {losValidation.references && losValidation.references.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {losValidation.references.map((ref: string, idx: number) => (
                      <span key={idx} className="inline-flex text-[10px] bg-muted border border-border px-1.5 py-0.5 rounded text-muted-foreground">
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Score Breakdown (collapsed by default within summary) */}
        <div className="border-t border-slate-200">
          <div className="flex items-center justify-between bg-slate-50 px-6 py-3">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Perhitungan Skor per Aspek</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopySanitizedInput}
                disabled={loadingInput}
                className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs font-light text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                title="Copy input JSON yang dikirim ke AI (sudah disanitasi PII)"
              >
                {copiedInput ? <CheckCheck className="w-3 h-3 text-green-500" /> : loadingInput ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" /> : <Copy className="w-3 h-3" />}
                {copiedInput ? 'Copied!' : 'Copy AI Input'}
              </button>
              <button
                onClick={handleCopyJSON}
                className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs font-light text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Copy hasil output JSON dari AI"
              >
                {copied ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Export JSON'}
              </button>
            </div>
          </div>
          <div className="px-6 pb-6">
            <ScoreBreakdownPanel score={validationScore} items={scoreBreakdown} />
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Detail Tabs ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-b-lg border-x border-b border-slate-200 bg-white shadow-sm">
        {/* Tab strip */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-100/80 hide-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-xs font-mono uppercase tracking-[0.15em] border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "border-primary bg-white text-primary"
                  : "border-transparent text-muted-foreground hover:bg-white/70 hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6 sm:p-8">

          {/* ── TAB: PATHWAY KLINIS ──────────────────────────────────────── */}
          {activeTab === "pathway" && (
            <div className="space-y-8 animate-fade-in">
              {/* Patient Clinical Summary */}
              {inputPayload && (
                <div>
                  <p className="mb-4 text-xs font-mono uppercase tracking-[0.2em] text-primary">Ringkasan Klinis Pasien</p>
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/30">
                    <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
                      {/* Identitas */}
                      <div className="bg-white/70 p-5">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Identitas Pasien</p>
                        <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                          <span className="text-muted-foreground font-light">Nama</span>
                          <span className="text-foreground font-light">{inputPayload.patient?.name || '—'}</span>
                          <span className="text-muted-foreground font-light">Gender / Tgl Lahir</span>
                          <span className="text-foreground font-light">{inputPayload.patient?.gender || '—'} · {(inputPayload.patient?.birthDate || inputPayload.patient?.dateOfBirth) ? new Date(inputPayload.patient.birthDate || inputPayload.patient.dateOfBirth).toLocaleDateString('id-ID') : '—'}</span>
                          <span className="text-muted-foreground font-light">MRN</span>
                          <span className="text-foreground font-light font-mono">{inputPayload.patient?.identifier?.[0]?.value || inputPayload.patient?.id || '—'}</span>
                          <span className="text-muted-foreground font-light">Asuransi</span>
                          <span className="text-foreground font-light">{inputPayload.extra?.insuranceNumber || '—'}</span>
                        </div>
                      </div>
                      {/* Episode */}
                      <div className="bg-slate-50/50 p-5">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Episode Perawatan</p>
                        <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                          <span className="text-muted-foreground font-light">Jenis</span>
                          <span className="text-foreground font-light">{inputPayload.encounter?.type || inputPayload.encounter?.class?.code || '—'}</span>
                          <span className="text-muted-foreground font-light">Masuk</span>
                          <span className="text-foreground font-light">{(inputPayload.encounter?.admissionDate || inputPayload.encounter?.period?.start) ? new Date(inputPayload.encounter.admissionDate || inputPayload.encounter.period.start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                          <span className="text-muted-foreground font-light">Pulang</span>
                          <span className="text-foreground font-light">{(inputPayload.encounter?.dischargeDate || inputPayload.encounter?.period?.end) ? new Date(inputPayload.encounter.dischargeDate || inputPayload.encounter.period.end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                          <span className="text-muted-foreground font-light">LOS</span>
                          {actualLOSVal > 0 ? (
                            <span className="text-foreground font-light">{actualLOSVal} Hari <span className="text-muted-foreground">{expectedLOSVal > 0 ? `(Standar AI: ${expectedLOSVal} hari)` : ''}</span></span>
                          ) : (
                            <span className="text-foreground font-light">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Diagnoses */}
                    {inputPayload.diagnoses?.length > 0 && (
                      <div className="border-t border-slate-200 bg-white/65 p-5">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Diagnosis</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {inputPayload.diagnoses.map((d: any, i: number) => (
                            <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-light border ${
                              d.type === 'primary' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'
                            }`}>
                              <span className="font-mono">{d.code}</span>
                              {(d.description || d.name) && <span>— {d.description || d.name}</span>}
                              <span className="opacity-60 text-[10px]">({d.type})</span>
                            </span>
                          ))}
                        </div>
                        {diagDetails.some((detail: any) => detail.clinicalSummary) && (
                          <div className="space-y-2 rounded-md border border-primary/10 bg-primary/5 p-3">
                            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-primary">Konteks Klinis AI per Diagnosis</p>
                            {diagDetails.filter((detail: any) => detail.clinicalSummary).map((detail: any, detailIndex: number) => (
                              <div key={`${detail.diagnosisCode || 'diagnosis'}-${detailIndex}`} className="border-t border-primary/10 pt-2 first:border-0 first:pt-0">
                                <p className="text-xs font-mono text-primary/80">{detail.diagnosisCode} — {detail.diagnosisName || 'Diagnosis'}</p>
                                <p className="mt-0.5 text-sm text-muted-foreground font-light italic">{detail.clinicalSummary}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Procedures & Medications summary */}
                    <div className="border-t border-border grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                      <div className="p-5">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Tindakan Diklaim ({inputPayload.procedures?.length || 0})</p>
                        <ul className="space-y-1">
                          {(inputPayload.procedures || []).slice(0, 5).map((p: any, i: number) => {
                            const name = p.name || p.description || p.procedureName || 'Tindakan medis';
                            const code = p.code || p.procedureCode;
                            return <li key={i} className="text-xs text-muted-foreground font-light">· <span className="text-foreground">{name}</span>{code ? <span className="font-mono"> — {code}</span> : null}</li>;
                          })}
                          {inputPayload.procedures?.length > 5 && <li className="text-xs text-muted-foreground">+ {inputPayload.procedures.length - 5} lainnya...</li>}
                        </ul>
                      </div>
                      <div className="p-5">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Obat Diklaim ({inputPayload.medications?.length || 0})</p>
                        <ul className="space-y-1">
                          {(inputPayload.medications || []).slice(0, 5).map((m: any, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground font-light">· {m.name}{m.quantity > 1 ? ` ×${m.quantity}` : ''}</li>
                          ))}
                          {inputPayload.medications?.length > 5 && <li className="text-xs text-muted-foreground">+ {inputPayload.medications.length - 5} lainnya...</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pathway Timeline */}
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Rekomendasi Pathway Terapi (AI)</p>
                  {inputPayload.diagnoses?.length > 1 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-light bg-muted text-muted-foreground border border-border">
                      Pathway utama + {inputPayload.diagnoses.length - 1} diagnosis konteks
                    </span>
                  )}
                  {expectedLOSVal > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-light bg-primary/10 text-primary border border-primary/20">
                      Hari 1{expectedLOSVal > 1 ? ` - ${expectedLOSVal}` : ''}
                    </span>
                  )}
                </div>
                {inputPayload.diagnoses?.length > 1 && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-muted-foreground">
                    Pathway ini tetap memakai diagnosis primer sebagai driver utama, tetapi AI generator menerima diagnosis sekunder/komplikasi sebagai konteks untuk monitoring, terapi pendukung, risiko, dan kriteria pulang.
                  </div>
                )}
                <PathwayTimeline phases={job.clinicalPathway?.phases || result.clinicalPathway?.recommendedPathway || result.clinicalPathway?.phases || []} />
              </div>
            </div>
          )}

          {/* ── TAB: BIAYA & OBAT ────────────────────────────────────────── */}
          {activeTab === "tariff" && (
            <div className="space-y-10 animate-fade-in">
              {/* Fee Schedule Validation */}
              <div>
                <p className="mb-4 text-xs font-mono uppercase tracking-[0.2em] text-foreground">Master Fee Schedule Validation</p>
                {tariffPriceSummary ? renderPriceSummary(tariffPriceSummary) : null}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-mono uppercase tracking-[0.2em] text-foreground/70">
                      <tr>
                        <th className="px-4 py-3">Procedure</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Total Claim (Rp)</th>
                        <th className="px-4 py-3 text-right">Total Master Max (Rp)</th>
                        <th className="px-4 py-3 text-right">Selisih</th>
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
                        const masterTotal = getProcedureMasterTotal(item);
                        const varianceAmount = getPriceVariance(toFiniteNumber(claimedTotal), masterTotal);
                        return (
                          <tr key={i} className={`transition-colors ${isOver ? "bg-red-500/5" : isNotFound || isUnder ? "bg-yellow-500/5" : "hover:bg-muted/30"}`}>
                            <td className="px-4 py-3">
                              <p className="font-light text-foreground">{getProcedureDisplayName(item)}</p>
                              {getProcedureDisplayCode(item) && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{getProcedureDisplayCode(item)}</p>}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-light text-muted-foreground">
                              {item.quantity || 1}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="font-mono text-sm font-light text-foreground">{claimedTotal ? new Intl.NumberFormat('id-ID').format(claimedTotal) : '—'}</div>
                              {claimedUnit ? (
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">@ {new Intl.NumberFormat('id-ID').format(claimedUnit)}</div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="font-mono text-sm font-light text-muted-foreground">{masterTotal !== null ? idrFormatter.format(masterTotal) : '—'}</div>
                              {item.masterMaxPrice || item.expectedMaxPrice ? (
                                <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">@ {new Intl.NumberFormat('id-ID').format(item.masterMaxPrice || item.expectedMaxPrice)}</div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {isNotFound ? '—' : (
                                <div className={variancePct > 0 ? 'text-red-500' : variancePct < -15 ? 'text-yellow-500' : 'text-green-600'}>
                                  <span>{variancePct > 0 ? '+' : ''}{variancePct.toFixed(1)}%</span>
                                  {varianceAmount !== null && (
                                    <div className="mt-0.5 text-[10px] font-light">{formatVarianceAmount(varianceAmount)}</div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isOver ? (
                                <span className="inline-flex items-center rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-red-600 ring-1 ring-inset ring-red-500/20">Overcharge</span>
                              ) : isUnder ? (
                                <span className="inline-flex items-center rounded bg-yellow-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-yellow-600 ring-1 ring-inset ring-yellow-500/20">Undercharge</span>
                              ) : isNotFound ? (
                                <span className="inline-flex items-center rounded bg-orange-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-orange-600 ring-1 ring-inset ring-orange-500/20">Unregistered</span>
                              ) : (
                                <span className="inline-flex items-center rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-green-600 ring-1 ring-inset ring-green-500/20">Compliant</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {tariffItems.some((t: any) => t.status === 'NOT_FOUND') && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 font-light">Beberapa tindakan berstatus <strong className="font-medium">Unregistered</strong> — belum terdaftar di Master Buku Tarif untuk provider ini. Harap daftarkan sebelum klaim diproses.</p>
                  </div>
                )}
              </div>

              {/* Drug Price Validation */}
              {drugItems && drugItems.length > 0 && (
                <div>
                  <p className="mb-4 text-xs font-mono uppercase tracking-[0.2em] text-foreground">Drug Price Validation</p>
                  {drugPriceSummary ? renderPriceSummary(drugPriceSummary) : null}
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-mono uppercase tracking-[0.2em] text-foreground/70">
                        <tr>
                          <th className="px-4 py-3">Drug Name</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Total Claim (Rp)</th>
                          <th className="px-4 py-3 text-right">Total Master Data (Rp)</th>
                          <th className="px-4 py-3 text-right">Selisih</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {drugItems.map((item: any, i: number) => {
                          const isDrugOver = item.status === "OVER_THRESHOLD" || item.status === "OVER_PRICED";
                          const isDrugUnder = item.status === "UNDER_PRICED";
                          const isDrugNotFound = item.status === "NOT_FOUND";
                          const isDrugNonMed = item.status === "NON_MEDICATION";
                          const drugVariancePct = item.variancePct ?? 0;
                          const drugClaimedTotal = getDrugClaimedTotal(item);
                          const drugClaimedUnit = getDrugClaimedUnit(item);
                          const drugMasterTotal = getDrugMasterTotal(item);
                          const drugVarianceAmount = getPriceVariance(toFiniteNumber(drugClaimedTotal), drugMasterTotal);
                          return (
                            <tr key={i} className={`transition-colors ${isDrugOver ? "bg-red-500/5" : isDrugNotFound || isDrugUnder ? "bg-yellow-500/5" : "hover:bg-muted/30"}`}>
                              <td className="px-4 py-3">
                                <p className="font-light text-foreground">{item.name || item.medicationName}</p>
                                {item.resolvedProductName && (
                                  <p className="text-[10px] text-primary/80 mt-0.5">Referensi: {item.resolvedProductName}</p>
                                )}
                                {item.unitBasis && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Unit: {item.unitBasis}</p>
                                )}
                                {Array.isArray(item.sources) && item.sources.length > 0 && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Sumber referensi: Master data farmalkes lokal</p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs font-light text-muted-foreground">
                                {item.quantity || 1}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="font-mono text-sm font-light text-foreground">{drugClaimedTotal ? new Intl.NumberFormat('id-ID').format(drugClaimedTotal) : '—'}</div>
                                {drugClaimedUnit ? (
                                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">@ {new Intl.NumberFormat('id-ID').format(drugClaimedUnit)}</div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="font-mono text-sm font-light text-muted-foreground">{drugMasterTotal !== null ? idrFormatter.format(drugMasterTotal) : '—'}</div>
                                {item.marketPriceMax || item.maxReferencePrice || item.marketMaxPrice ? (
                                  <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">@ {idrFormatter.format(item.marketPriceMax || item.maxReferencePrice || item.marketMaxPrice)}</div>
                                ) : null}
                                {(item.fixPrice || item.hetPrice || item.maxReferencePrice) ? (
                                  <div className="mt-1 text-[10px] text-muted-foreground/70 font-mono">
                                    Fix {item.fixPrice ? new Intl.NumberFormat('id-ID').format(item.fixPrice) : '—'} · HET {item.hetPrice ? new Intl.NumberFormat('id-ID').format(item.hetPrice) : '—'} · Max {new Intl.NumberFormat('id-ID').format(item.maxReferencePrice || item.marketPriceMax || 0)}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {isDrugNotFound || isDrugNonMed ? '—' : (
                                  <div className={drugVariancePct > 0 ? 'text-red-500' : drugVariancePct < -15 ? 'text-yellow-500' : 'text-green-600'}>
                                    <span>{drugVariancePct > 0 ? '+' : ''}{drugVariancePct.toFixed(1)}%</span>
                                    {drugVarianceAmount !== null && (
                                      <div className="mt-0.5 text-[10px] font-light">{formatVarianceAmount(drugVarianceAmount)}</div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isDrugOver ? (
                                  <span className="inline-flex items-center rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-red-600 ring-1 ring-inset ring-red-500/20">Overcharge</span>
                                ) : isDrugUnder ? (
                                  <span className="inline-flex items-center rounded bg-yellow-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-yellow-600 ring-1 ring-inset ring-yellow-500/20">Undercharge</span>
                                ) : isDrugNonMed ? (
                                  <span className="inline-flex items-center rounded bg-slate-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-500 ring-1 ring-inset ring-slate-500/20">Bukan Obat</span>
                                ) : isDrugNotFound ? (
                                  <span className="inline-flex items-center rounded bg-orange-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-orange-600 ring-1 ring-inset ring-orange-500/20">Referensi N/A</span>
                                ) : (
                                  <span className="inline-flex items-center rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-green-600 ring-1 ring-inset ring-green-500/20">Compliant</span>
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

          {/* ── TAB: POLICY & BENEFIT ─────────────────────────────────── */}
          {activeTab === "policy" && (
            <div className="space-y-6 animate-fade-in">
              <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary">Policy & Benefit Engine</p>
                    <h3 className="mt-2 text-xl font-light text-foreground">Validasi TC Polis dan benefit</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      {policyValidation?.summary || 'Belum ada hasil validasi polis untuk klaim ini. Rule dapat dikirim dari sistem integrasi atau dikelola sebagai master data client.'}
                    </p>
                  </div>
                  <span className={`inline-flex w-fit items-center rounded px-2.5 py-1 text-xs font-mono uppercase tracking-[0.12em] ${
                    !policyValidation || policyValidation.status === 'PASS'
                      ? 'bg-green-500/10 text-green-700 ring-1 ring-inset ring-green-500/20'
                      : policyValidation.status === 'WARNING'
                        ? 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20'
                        : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'
                  }`}>
                    {policyValidation?.status || 'BELUM ADA'}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary/80">Rule Dievaluasi</p>
                    <p className="mt-2 font-mono text-2xl font-light text-foreground">{policyValidation?.evaluatedRuleCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary/80">Temuan</p>
                    <p className="mt-2 font-mono text-2xl font-light text-foreground">{policyFindings.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Covered</p>
                    <p className="mt-2 font-mono text-lg font-light text-foreground">Rp {formatIdrAmount(policyValidation?.totals.coveredAmount ?? 0)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Excess Estimasi</p>
                    <p className="mt-2 font-mono text-lg font-light text-red-600">Rp {formatIdrAmount(policyValidation?.totals.excessAmount ?? 0)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Temuan Rule Polis</p>
                </div>
                {policyFindings.length > 0 ? (
                  <div className="divide-y divide-border/60">
                    {policyFindings.map((finding: any) => (
                      <div key={`${finding.ruleCode}-${finding.message}`} className="p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{finding.ruleName}</p>
                              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{finding.ruleType}</span>
                              <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                                finding.severity === 'INFO'
                                  ? 'bg-slate-500/10 text-slate-600'
                                  : finding.severity === 'WARNING'
                                    ? 'bg-amber-500/10 text-amber-700'
                                    : 'bg-red-500/10 text-red-700'
                              }`}>
                                {finding.severity}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.message}</p>
                            <p className="mt-1 text-sm leading-6 text-foreground">Rekomendasi: {finding.recommendation}</p>
                          </div>
                          {finding.calculation && (
                            <div className="min-w-52 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                              <div className="flex justify-between gap-4 py-1"><span className="text-muted-foreground">Claim</span><span className="font-mono text-foreground">Rp {formatIdrAmount(finding.calculation.claimAmount)}</span></div>
                              <div className="flex justify-between gap-4 py-1"><span className="text-muted-foreground">Covered</span><span className="font-mono text-foreground">Rp {formatIdrAmount(finding.calculation.coveredAmount)}</span></div>
                              <div className="flex justify-between gap-4 py-1"><span className="text-muted-foreground">Excess</span><span className="font-mono text-red-600">Rp {formatIdrAmount(finding.calculation.excessAmount)}</span></div>
                            </div>
                          )}
                        </div>
                        {finding.evidence && finding.evidence.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {finding.evidence.map((evidence: any) => (
                              <span key={`${finding.ruleCode}-${evidence.type}-${evidence.label}-${evidence.value}`} className="inline-flex rounded border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                                {evidence.label}: <span className="ml-1 font-mono text-foreground">{evidence.value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">
                    Tidak ada temuan rule polis. Tambahkan rule dari sistem integrasi atau aktifkan master rule client untuk menguji pengecualian, limit, deductible, co-pay, pre-authorisation, dan entitlement kamar.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: DIAGNOSIS & DOKUMEN ─────────────────────────────────── */}
          {activeTab === "diagnosis" && (
            <div className="space-y-10 animate-fade-in">
              {/* Diagnosis vs Procedure Validation */}
              <div>
                <p className="mb-4 text-xs font-mono uppercase tracking-[0.2em] text-foreground">Diagnosis vs Procedure Validation</p>
                <div className="space-y-3">
                  {diagDetails.map((diag: any, i: number) => {
                    const diagnosisKey = `${diag.diagnosisCode || 'diagnosis'}-${i}`;
                    const inputDiagnosis = inputPayload?.diagnoses?.find((diagnosis: any) => diagnosis.code === diag.diagnosisCode);
                    const diagnosisType = String(inputDiagnosis?.type || '').toUpperCase();
                    const isExpanded = isDiagnosisDetailExpanded(diagnosisKey);

                    return (
                      <div key={diagnosisKey} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {/* Diag header */}
                        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-light text-primary bg-primary/10 px-2 py-0.5 rounded">{diag.diagnosisCode}</span>
                              {diagnosisType && (
                                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{diagnosisType}</span>
                              )}
                              <h4 className="font-light text-foreground text-sm">{diag.diagnosisName || diag.diagnosisCode}</h4>
                            </div>
                            {diag.clinicalSummary && isExpanded && (
                              <p className="text-xs text-muted-foreground mt-1.5 italic max-w-xl">{diag.clinicalSummary}</p>
                            )}
                            {diag.clinicalEvidenceSummary && isExpanded && (
                              <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                                <div className="flex items-start gap-2">
                                  <BrainCircuit className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                  <p className="text-xs text-foreground/90 leading-relaxed">{diag.clinicalEvidenceSummary}</p>
                                </div>
                                {diag.evidenceReferences?.filter((ref: any) => !ref.title?.toLowerCase().includes('inspired by')).length > 0 && (
                                  <div className="mt-3">
                                    <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground mb-1.5 flex items-center gap-1">
                                      <BookOpen className="w-3 h-3" /> Referensi
                                    </p>
                                    <div className="flex flex-col gap-1.5">
                                      {diag.evidenceReferences.filter((ref: any) => !ref.title?.toLowerCase().includes('inspired by')).map((ref: any, rIdx: number) => (
                                        <div key={rIdx} className="text-[11px] bg-white rounded-md border border-slate-200 px-2.5 py-2">
                                          <p className="font-medium text-slate-800 leading-snug">{ref.title}</p>
                                          {(ref.organization || ref.year) && <p className="text-slate-500 mt-0.5">{ref.organization} {ref.year}</p>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDiagnosisDetail(diagnosisKey)}
                            aria-expanded={isExpanded}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-border bg-card px-3 py-2 text-xs font-light text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 shrink-0"
                          >
                            {isExpanded ? 'Sembunyikan detail' : 'Tampilkan detail'}
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        
                        {isExpanded && <div className="p-5 space-y-3">
                          {diag.missingRequiredProcedures && diag.missingRequiredProcedures.length > 0 && (
                            <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-md">
                              <p className="text-xs font-mono uppercase tracking-[0.15em] text-orange-600 mb-1.5">Prosedur wajib belum diklaim ({diag.missingRequiredProcedures.length})</p>
                              <p className="mb-2 text-xs leading-5 text-orange-700/80">Daftar ini hanya untuk prosedur yang dianggap wajib oleh mapping/pathway. Setiap item perlu dicek terhadap konteks klinis pasien.</p>
                              <ul className="space-y-2">
                                {diag.missingRequiredProcedures.map((p: string, j: number) => {
                                  const detail = diag.missingRequiredProcedureDetails?.find((item: any) => p.includes(item.code) || item.code === p);
                                  return (
                                    <li key={j} className="rounded bg-card p-3 text-sm border border-orange-200 bg-orange-50/30">
                                      <p className="font-medium text-orange-900">{detail?.name || p}</p>
                                      {detail?.code && <p className="mt-0.5 font-mono text-[11px] text-orange-700/70">{detail.code}</p>}
                                      {detail?.reason && (
                                        <div className="mt-2 rounded-md bg-white/60 p-2.5 border border-orange-100">
                                          <div className="flex items-start gap-2">
                                            <BrainCircuit className="w-4 h-4 text-orange-500 shrink-0 mt-0.5 opacity-70" />
                                            <div>
                                              <p className="text-xs text-orange-900/90 leading-relaxed">{detail.reason}</p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                          
                          {diag.procedureFindings && diag.procedureFindings.length > 0 && (
                            <div className="p-3 bg-slate-500/5 border border-border rounded-md">
                              <p className="text-xs font-mono uppercase tracking-[0.15em] text-foreground mb-1.5">Kesesuaian tindakan terhadap diagnosis ({diag.procedureFindings.length})</p>
                              <p className="mb-2 text-xs leading-5 text-muted-foreground">Bagian ini menjelaskan apakah tindakan yang diklaim sesuai, perlu konteks tambahan, atau tidak sesuai terhadap diagnosis.</p>
                              <ul className="space-y-2">
                                {diag.procedureFindings.map((p: any, j: number) => {
                                  const isIssue = p.status === 'REVIEW_NEEDED' || p.status === 'INAPPROPRIATE';
                                  return (
                                    <li key={j} className={`rounded bg-card p-3 text-sm border ${isIssue ? 'border-amber-200 bg-amber-50/30' : 'border-green-200 bg-green-50/30'}`}>
                                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-2">
                                        <div>
                                          <p className="font-medium text-foreground">{getProcedureLine(p).name}</p>
                                          {getProcedureLine(p).code && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{getProcedureLine(p).code}</p>}
                                        </div>
                                        <span className={`w-fit shrink-0 rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] ${p.status === 'APPROPRIATE' ? 'bg-green-500/10 text-green-700' : p.status === 'INAPPROPRIATE' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>
                                          {p.status === 'APPROPRIATE' ? 'Sesuai' : p.status === 'INAPPROPRIATE' ? 'Tidak Sesuai' : 'Perlu Review'}
                                        </span>
                                      </div>
                                      <div className="rounded-md bg-white/60 p-2.5 border border-slate-100 mb-2">
                                        <div className="flex items-start gap-2">
                                          <BrainCircuit className="w-4 h-4 text-primary shrink-0 mt-0.5 opacity-70" />
                                          <div>
                                            <p className="text-xs text-foreground/90 leading-relaxed">{p.reason}</p>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                        <span>Dinilai terhadap: <span className="font-mono text-foreground/80">{p.againstDiagnosis || diag.diagnosisCode}</span></span>
                                        <span>·</span>
                                        <span>Keyakinan AI: <span className="text-foreground/80">{p.confidence === 'HIGH' ? 'Tinggi' : p.confidence === 'MEDIUM' ? 'Sedang' : 'Rendah'}</span></span>
                                      </div>
                                      {p.evidenceReferences?.filter((ref: any) => !ref.title?.toLowerCase().includes('inspired by')).length > 0 && (
                                        <div className="mt-3">
                                          <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground mb-1.5 flex items-center gap-1">
                                            <BookOpen className="w-3 h-3" /> Referensi
                                          </p>
                                          <div className="flex flex-col gap-1.5">
                                            {p.evidenceReferences.filter((ref: any) => !ref.title?.toLowerCase().includes('inspired by')).map((ref: any, rIdx: number) => (
                                              <div key={rIdx} className="text-[11px] bg-white rounded-md border border-slate-200 px-2.5 py-2">
                                                <p className="font-medium text-slate-800 leading-snug">{ref.title}</p>
                                                {(ref.organization || ref.year) && <p className="text-slate-500 mt-0.5">{ref.organization} {ref.year}</p>}
                                                {ref.relevance && <p className="text-slate-600 italic mt-1.5 border-l-2 border-slate-200 pl-2">{ref.relevance}</p>}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {(!diag.procedureFindings || diag.procedureFindings.length === 0) && diag.matchedProcedures && diag.matchedProcedures.length > 0 && (
                            <div className="p-3 bg-slate-500/5 border border-border rounded-md">
                              <p className="text-xs font-mono uppercase tracking-[0.15em] text-foreground mb-1.5">Kesesuaian tindakan terhadap diagnosis ({diag.matchedProcedures.length})</p>
                              <p className="mb-2 text-xs leading-5 text-muted-foreground">Tindakan ini dinilai sesuai oleh AI. (Detail reasoning belum didukung pada hasil analisis versi sebelumnya).</p>
                              <ul className="space-y-2">
                                {diag.matchedProcedures.map((p: any, j: number) => (
                                  <li key={j} className="rounded bg-card p-3 text-sm border border-green-200 bg-green-50/30">
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="font-medium text-foreground">{getProcedureLine(p).name}</p>
                                        {getProcedureLine(p).code && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{getProcedureLine(p).code}</p>}
                                      </div>
                                      <span className="w-fit shrink-0 rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] bg-green-500/10 text-green-700">
                                        Sesuai
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {((diag.irrelevantProcedures && diag.irrelevantProcedures.length > 0) || (diag.unmatchedProcedures && diag.unmatchedProcedures.length > 0)) && (
                            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-md">
                              <p className="text-xs font-mono uppercase tracking-[0.15em] text-red-600 mb-1.5">Tindakan perlu review relevansi ({(diag.irrelevantProcedures?.length || diag.unmatchedProcedures?.length || 0)})</p>
                              <p className="mb-2 text-xs leading-5 text-red-700/80">Tindakan di bawah ini hanya ditandai jika AI memberi alasan klinis spesifik. Tidak relevan berarti tidak ada hubungan jelas terhadap diagnosis yang dinilai.</p>
                              <ul className="space-y-2">
                                {(diag.irrelevantProcedures?.length ? diag.irrelevantProcedures : diag.unmatchedProcedures).map((item: any, j: number) => {
                                  const isDetailed = typeof item === 'object' && item !== null;
                                  return (
                                    <li key={j} className="rounded bg-card p-3 text-sm border border-red-200 bg-red-50/30">
                                      {isDetailed ? (
                                        <div>
                                          <p className="font-medium text-red-900">{getProcedureLine(item).name}</p>
                                          {getProcedureLine(item).code && <p className="mt-0.5 font-mono text-[11px] text-red-700/70">{getProcedureLine(item).code}</p>}
                                        </div>
                                      ) : (
                                        <p className="font-medium text-red-900">{String(item).split(':')[0]}</p>
                                      )}
                                      
                                      {isDetailed ? (
                                        <>
                                          <div className="mt-2 rounded-md bg-white/60 p-2.5 border border-red-100 mb-2">
                                            <div className="flex items-start gap-2">
                                              <BrainCircuit className="w-4 h-4 text-red-500 shrink-0 mt-0.5 opacity-70" />
                                              <div>
                                                <p className="text-xs text-red-900/90 leading-relaxed">{item.reason}</p>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-red-700/70">
                                            <span>Dinilai terhadap: <span className="font-mono text-red-800/80">{item.againstDiagnosis || diag.diagnosisCode}</span></span>
                                            <span>·</span>
                                            <span>Keyakinan AI: <span className="text-red-800/80">{item.confidence === 'HIGH' ? 'Tinggi' : 'Sedang'}</span></span>
                                          </div>
                                        </>
                                      ) : String(item).includes(':') ? (
                                        <div className="mt-2 rounded-md bg-white/60 p-2.5 border border-red-100">
                                          <div className="flex items-start gap-2">
                                            <BrainCircuit className="w-4 h-4 text-red-500 shrink-0 mt-0.5 opacity-70" />
                                            <div>
                                              <p className="text-xs text-red-900/90 leading-relaxed">{String(item).split(':').slice(1).join(':').trim()}</p>
                                            </div>
                                          </div>
                                        </div>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {diag.medicationFindings && diag.medicationFindings.length > 0 && (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                              <p className="text-xs font-mono uppercase tracking-[0.15em] text-foreground mb-1.5">Kesesuaian obat terhadap diagnosis ({diag.medicationFindings.length})</p>
                              <p className="mb-2 text-xs leading-5 text-muted-foreground">Bagian ini menilai apakah obat yang diklaim selaras dengan diagnosis, termasuk terapi utama, suportif, simptomatik, antibiotik, cairan, atau obat komorbid.</p>
                              <ul className="space-y-2">
                                {diag.medicationFindings.map((m: any, j: number) => {
                                  const isIssue = m.status === 'REVIEW_NEEDED' || m.status === 'INAPPROPRIATE';
                                  return (
                                    <li key={j} className={`rounded bg-card p-3 text-sm border ${isIssue ? 'border-amber-200 bg-amber-50/30' : 'border-green-200 bg-green-50/30'}`}>
                                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-2">
                                        <p className="font-medium text-foreground">{m.medicationName}{m.genericName ? ` (${m.genericName})` : ''}</p>
                                        <span className={`w-fit shrink-0 rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] ${m.status === 'APPROPRIATE' ? 'bg-green-500/10 text-green-700' : m.status === 'INAPPROPRIATE' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>
                                          {m.status === 'APPROPRIATE' ? 'Sesuai' : m.status === 'INAPPROPRIATE' ? 'Tidak Sesuai' : 'Perlu Review'}
                                        </span>
                                      </div>
                                      <div className="rounded-md bg-white/60 p-2.5 border border-slate-100 mb-2">
                                        <div className="flex items-start gap-2">
                                          <BrainCircuit className="w-4 h-4 text-primary shrink-0 mt-0.5 opacity-70" />
                                          <div>
                                            <p className="text-xs text-foreground/90 leading-relaxed">{m.reason}</p>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                        <span>Dinilai terhadap: <span className="font-mono text-foreground/80">{m.againstDiagnosis || diag.diagnosisCode}</span></span>
                                        <span>·</span>
                                        <span>Keyakinan AI: <span className="text-foreground/80">{m.confidence === 'HIGH' ? 'Tinggi' : m.confidence === 'MEDIUM' ? 'Sedang' : 'Rendah'}</span></span>
                                      </div>
                                      {m.evidenceReferences?.filter((ref: any) => !ref.title?.toLowerCase().includes('inspired by')).length > 0 && (
                                        <div className="mt-3">
                                          <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground mb-1.5 flex items-center gap-1">
                                            <BookOpen className="w-3 h-3" /> Referensi
                                          </p>
                                          <div className="flex flex-col gap-1.5">
                                            {m.evidenceReferences.filter((ref: any) => !ref.title?.toLowerCase().includes('inspired by')).map((ref: any, rIdx: number) => (
                                              <div key={rIdx} className="text-[11px] bg-white rounded-md border border-slate-200 px-2.5 py-2">
                                                <p className="font-medium text-slate-800 leading-snug">{ref.title}</p>
                                                {(ref.organization || ref.year) && <p className="text-slate-500 mt-0.5">{ref.organization} {ref.year}</p>}
                                                {ref.relevance && <p className="text-slate-600 italic mt-1.5 border-l-2 border-slate-200 pl-2">{ref.relevance}</p>}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {diag.suggestedProcedures && diag.suggestedProcedures.length > 0 && (
                            <div className="p-3 bg-primary/5 border border-primary/10 rounded-md">
                              <p className="text-xs font-mono uppercase tracking-[0.15em] text-primary mb-1.5">Saran tindakan tambahan AI, belum diklaim</p>
                              <p className="mb-2 text-xs leading-5 text-primary/75">Saran ini bersifat pendukung/advisory, bukan otomatis wajib. Gunakan untuk review apakah tindakan tambahan memang diperlukan.</p>
                              <ul className="space-y-2">
                                {diag.suggestedProcedures.map((s: any, j: number) => (
                                  <li key={j} className="rounded bg-card p-2 text-sm">
                                    <p className="font-light text-primary">{s.name || 'Tindakan medis'}</p>
                                    {s.code && <p className="mt-0.5 font-mono text-[11px] text-primary/65">{s.code}</p>}
                                    {s.rationale && <p className="mt-1 text-xs leading-5 text-primary/70">Alasan saran: {s.rationale}</p>}
                                    {s.evidenceLevel && <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.15em] text-primary/60">Level: {s.evidenceLevel === 'COMMON' ? 'Umum pada pathway' : 'Opsional sesuai indikasi'}</p>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {(!diag.missingRequiredProcedures?.length && !diag.unmatchedProcedures?.length && !diag.procedureFindings?.some((f: any) => f.status !== 'APPROPRIATE') && !diag.medicationFindings?.some((f: any) => f.status !== 'APPROPRIATE')) && (
                            <div className="flex items-center gap-1.5 text-sm text-green-600">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                              Semua tindakan dan obat sesuai dengan diagnosis.
                            </div>
                          )}
                          {diag.notes && !diag.notes.includes('Lookup table mapping') && (
                            <p className="text-xs text-muted-foreground italic border-t border-border pt-2 mt-2">AI Note: {diag.notes}</p>
                          )}
                        </div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Document Completeness */}
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">Document Completeness Validation</p>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {docDetails.missingRequiredDocuments?.length > 0 && (
                    <div className="px-5 py-4 border-b border-red-200 bg-red-50">
                      <p className="text-sm font-light text-red-800">Mandatory document tidak terlampir.</p>
                      <p className="mt-1 text-xs text-red-700/80 leading-5">Admin perlu melengkapi atau meminta ulang dokumen berikut sebelum klaim diproses lebih lanjut: {docDetails.missingRequiredDocuments.join(', ')}.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                    <div className="p-5">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Attached Documents</p>
                      {docDetails.providedDocuments?.length > 0 ? (
                        <ul className="space-y-1.5">
                          {docDetails.providedDocuments.map((doc: string, i: number) => (
                            <li key={i} className="flex items-center gap-2 text-sm font-light text-muted-foreground">
                              <svg className="w-4 h-4 shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                              {doc}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm font-light text-muted-foreground italic">None</p>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Missing Required Documents</p>
                      {docDetails.missingRequiredDocuments?.length > 0 ? (
                        <ul className="space-y-1.5">
                          {docDetails.missingRequiredDocuments.map((doc: string, i: number) => (
                            <li key={i} className="flex items-center gap-2 text-sm font-light text-red-600">
                              <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                              {doc}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm font-light text-green-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
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
