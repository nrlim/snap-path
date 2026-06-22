"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface WorkflowStepResult {
  stepId: string;
  status: "waiting" | "running" | "completed" | "failed";
  label: string;
  description: string;
  timestamp: string;
  durationMs?: number;
  durationSec?: string;
  error?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  payload: any;
}

type StoredWorkflow = {
  runId: string;
  jobId: string;
  startedAt: number;
};

const ACTIVE_WORKFLOW_STORAGE_KEY = "snappath.activeClaimWorkflow";

const WORKFLOW_STEPS: WorkflowStepResult[] = [
  { stepId: "init", label: "Inisialisasi", description: "Memvalidasi data awal dan menyiapkan job...", status: "waiting", timestamp: "" },
  { stepId: "doc-val", label: "Validasi Dokumen", description: "Mengecek kelengkapan berkas pendukung klaim...", status: "waiting", timestamp: "" },
  { stepId: "diag-val", label: "Validasi Diagnosis", description: "Menganalisis kesesuaian diagnosis dan tindakan medis (ICD-10)...", status: "waiting", timestamp: "" },
  { stepId: "tariff-val", label: "Validasi Tarif", description: "Mengecek kewajaran harga tindakan medis...", status: "waiting", timestamp: "" },
  { stepId: "drug-val", label: "Cek Harga Obat", description: "Memvalidasi kesesuaian harga obat dengan HET...", status: "waiting", timestamp: "" },
  { stepId: "los-val", label: "Validasi Lama Rawat (LOS)", description: "Memvalidasi kesesuaian Length of Stay berdasarkan diagnosis...", status: "waiting", timestamp: "" },
  { stepId: "pathway-gen", label: "Generate Clinical Pathway", description: "Menyusun standard clinical pathway berdasarkan diagnosis...", status: "waiting", timestamp: "" },
  { stepId: "aggregate", label: "Agregasi Hasil", description: "Menyelesaikan validasi dan menghitung skor akhir...", status: "waiting", timestamp: "" },
];

export { ACTIVE_WORKFLOW_STORAGE_KEY };

export default function WorkflowProgressModal({ isOpen, onClose, payload }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<WorkflowStepResult[]>(WORKFLOW_STEPS.map((s) => ({ ...s })));
  const [isDone, setIsDone] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnimationRef = useRef<NodeJS.Timeout | null>(null);
  const stepStartTimes = useRef<Record<number, number>>({});
  const currentStepIdxRef = useRef(0);
  const targetStepIdxRef = useRef(0);
  const [, setTicker] = useState(0);

  useEffect(() => {
    if (!isOpen || isDone) return;
    const tickInterval = setInterval(() => setTicker((t) => t + 1), 100);
    return () => clearInterval(tickInterval);
  }, [isOpen, isDone]);

  const jobStatusToStepIdx: Record<string, number> = {
    QUEUED: 0,
    INIT: 0,
    DOC_VAL: 1,
    DIAG_VAL: 2,
    TARIFF_VAL: 3,
    DRUG_VAL: 4,
    LOS_VAL: 5,
    PATHWAY_GEN: 6,
    AGGREGATE: 7,
    // PRE_PROCESSING / POST_PROCESSING are generic — keep wherever we are
    PRE_PROCESSING: -1,
    POST_PROCESSING: -1,
    PROCESSING: -1,
  };

  function clearStoredWorkflow() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ACTIVE_WORKFLOW_STORAGE_KEY);
    }
  }

  function applyStepProgress(effectiveIdx: number) {
    const prevIdx = currentStepIdxRef.current;
    const now = Date.now();

    if (effectiveIdx > prevIdx) {
      for (let i = prevIdx + 1; i <= effectiveIdx; i++) {
        if (!stepStartTimes.current[i]) stepStartTimes.current[i] = now;
      }
    }

    if (!stepStartTimes.current[effectiveIdx]) stepStartTimes.current[effectiveIdx] = now;
    currentStepIdxRef.current = effectiveIdx;
    setCurrentStepIdx(effectiveIdx);
    setSteps((prev) => prev.map((step, idx) => {
      if (idx < effectiveIdx) {
        const start = stepStartTimes.current[idx] || now;
        const dur = step.durationSec || ((now - start) / 1000).toFixed(1);
        return { ...step, status: "completed", durationSec: dur };
      }
      if (idx === effectiveIdx) return { ...step, status: "running" };
      return { ...step, status: "waiting" };
    }));
  }

  function markStepsProgress(activeIdx: number) {
    // Never go backwards. If polling jumps several DB statuses at once, animate
    // through each intermediate step so the user sees a smooth step-by-step flow.
    targetStepIdxRef.current = Math.max(activeIdx, targetStepIdxRef.current, currentStepIdxRef.current);

    if (progressAnimationRef.current) return;

    const advance = () => {
      const current = currentStepIdxRef.current;
      const target = targetStepIdxRef.current;
      const next = target > current ? current + 1 : target;
      applyStepProgress(next);

      if (targetStepIdxRef.current > next) {
        progressAnimationRef.current = setTimeout(advance, 650);
      } else {
        progressAnimationRef.current = null;
      }
    };

    advance();
  }

  function markAllDone() {
    const now = Date.now();
    setSteps((prev) => prev.map((step, idx) => {
      const start = stepStartTimes.current[idx] || now;
      const dur = step.durationSec || ((now - start) / 1000).toFixed(1);
      return { ...step, status: "completed", durationSec: dur };
    }));
    if (progressAnimationRef.current) {
      clearTimeout(progressAnimationRef.current);
      progressAnimationRef.current = null;
    }
    currentStepIdxRef.current = WORKFLOW_STEPS.length;
    targetStepIdxRef.current = WORKFLOW_STEPS.length;
    setCurrentStepIdx(WORKFLOW_STEPS.length);
    setIsDone(true);
    clearStoredWorkflow();
  }

  function markFailed(errMsg: string) {
    const failIdx = currentStepIdxRef.current;
    setSteps((prev) => prev.map((step, idx) => idx === failIdx ? { ...step, status: "failed", error: errMsg } : step));
    setError(errMsg);
    setIsDone(true);
    clearStoredWorkflow();
  }

  useEffect(() => {
    if (!isOpen || !payload) return;

    const resumeData = payload.__resume as StoredWorkflow | undefined;
    const runStartedAt = resumeData?.startedAt || Date.now();
    setSteps(WORKFLOW_STEPS.map((s) => ({ ...s })));
    setIsDone(false);
    setIsMinimized(Boolean(resumeData));
    setError(null);
    setCurrentStepIdx(0);
    currentStepIdxRef.current = 0;
    targetStepIdxRef.current = 0;
    setStartedAt(runStartedAt);
    stepStartTimes.current = { 0: runStartedAt };

    let stopped = false;

    const startPolling = (runId: string, jobId: string) => {
      markStepsProgress(0);
      intervalRef.current = setInterval(async () => {
        if (stopped) return;
        try {
          const pollRes = await fetch(`/api/v1/claims/poll?runId=${runId}&jobId=${jobId}`);
          const data = await pollRes.json();

          if (data.status === "running") {
            const mappedIdx = jobStatusToStepIdx[data.jobStatus ?? "PROCESSING"];
            // -1 or undefined means unknown/generic status — preserve the current step index via ref
            const stepIdx = (mappedIdx === undefined || mappedIdx === -1) ? currentStepIdxRef.current : mappedIdx;
            markStepsProgress(stepIdx);
          } else if (data.status === "completed") {
            clearInterval(intervalRef.current!);
            markAllDone();
            setTimeout(() => {
              router.push(`/dashboard/clinical-pathway/${jobId}`);
              router.refresh();
              onClose();
            }, 1200);
          } else if (data.status === "failed" || data.status === "not_found") {
            clearInterval(intervalRef.current!);
            markFailed(data.error || "Workflow gagal. Silakan coba lagi.");
          }
        } catch (pollErr) {
          console.warn("Polling error:", pollErr);
        }
      }, 2500);
    };

    const startWorkflow = async () => {
      try {
        if (resumeData) {
          startPolling(resumeData.runId, resumeData.jobId);
          return;
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/v1/claims/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const { runId, jobId } = await res.json();
        const storedWorkflow: StoredWorkflow = { runId, jobId, startedAt: runStartedAt };
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(ACTIVE_WORKFLOW_STORAGE_KEY, JSON.stringify(storedWorkflow));
        }
        startPolling(runId, jobId);
      } catch (err: any) {
        if (!stopped) markFailed(err.message || "Gagal memulai workflow validasi.");
      }
    };

    startWorkflow();

    return () => {
      stopped = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressAnimationRef.current) clearTimeout(progressAnimationRef.current);
    };
  }, [isOpen, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const now = Date.now();
  const currentStep = currentStepIdx < steps.length ? steps[currentStepIdx] : steps[steps.length - 1];
  const elapsedSec = startedAt ? ((now - startedAt) / 1000).toFixed(1) : "0.0";

  return (
    <>
      {!isMinimized && <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity" onClick={isDone ? onClose : undefined} />}
      <div className={`fixed z-50 transform transition-all duration-300 bg-surface border border-border overflow-hidden flex flex-col shadow-2xl ${
        isMinimized
          ? "bottom-20 right-3 left-3 max-h-[168px] rounded-[22px] sm:bottom-4 sm:left-auto sm:w-[380px] sm:max-h-[190px]"
          : "inset-x-0 bottom-0 lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-full lg:max-w-md w-full rounded-t-[24px] lg:rounded-2xl max-h-[90vh]"
      }`}>
        <div className="p-5 border-b border-border/60 flex items-center justify-between bg-surface sticky top-0 z-20">
          <div className="min-w-0">
            {!isMinimized && <div className="w-12 h-1.5 bg-border/80 rounded-full mx-auto mb-4 lg:hidden" />}
            <h2 className={`${isMinimized ? "text-base" : "text-xl"} font-medium text-text mb-1 flex items-center gap-2`}>
              AI Brain Validation
              {isMinimized && currentStepIdx < steps.length && <span className="relative ml-1 flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>}
            </h2>
            <p className="truncate text-xs text-text-subtle">{isMinimized && currentStep ? currentStep.description : "Memproses data klaim dan medical records..."}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsMinimized(!isMinimized)} className="min-h-11 min-w-11 p-2 text-text-subtle hover:bg-surface-elevated rounded-md transition-colors" title={isMinimized ? "Expand" : "Minimize"}>
              {isMinimized ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              )}
            </button>
            {isDone && <button onClick={onClose} className="min-h-11 min-w-11 p-2 text-text-subtle hover:bg-surface-elevated rounded-md transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>}
          </div>
        </div>

        {isMinimized && currentStep ? (
          <div className="border-b border-border/60 px-5 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="truncate text-xs font-medium uppercase tracking-[0.1em] text-primary">{currentStep.label}</span>
              <span className="font-mono text-xs font-medium text-text-subtle">{elapsedSec}s</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, ((Math.min(currentStepIdx + 1, steps.length)) / steps.length) * 100)}%` }} />
            </div>
          </div>
        ) : null}

        <div className={`${isMinimized ? "hidden" : "flex-1"} overflow-y-auto p-6 space-y-5`}>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-200 mb-4">{error}</div>}
          {steps.map((step, idx) => (
            <div key={step.stepId} className="flex gap-4 relative">
              {idx !== steps.length - 1 && <div className="absolute top-8 bottom-[-20px] left-3.5 w-[2px] bg-border/60" />}
              <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-surface">
                {step.status === "waiting" && <div className="w-3 h-3 rounded-full bg-border" />}
                {step.status === "running" && <svg className="animate-spin w-5 h-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                {step.status === "completed" && <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div>}
                {step.status === "failed" && <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></div>}
              </div>
              <div className={`flex-1 pt-1 pb-1 ${step.status === "waiting" ? "opacity-50" : "opacity-100"}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <h4 className={`font-medium text-sm ${step.status === "failed" ? "text-red-600" : "text-text"}`}>{step.label}</h4>
                  <div className="flex items-center gap-2">
                    {step.status === "running" && <span className="text-xs font-mono text-primary font-medium">{((now - (stepStartTimes.current[idx] || now)) / 1000).toFixed(1)}s</span>}
                    {step.status === "completed" && step.durationSec && <span className="text-xs font-mono text-text-subtle">{step.durationSec}s</span>}
                  </div>
                </div>
                <p className="text-xs text-text-subtle leading-relaxed">{step.status === "failed" && step.error ? step.error : step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {isDone && !isMinimized && (
          <div className="p-4 border-t border-border/60 bg-surface-elevated/50 text-center">
            {error ? <button onClick={onClose} className="w-full py-2.5 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-elevated transition-colors">Tutup</button> : <p className="text-sm font-medium text-primary flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Mengalihkan ke halaman hasil...</p>}
          </div>
        )}
      </div>
    </>
  );
}
