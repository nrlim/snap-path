"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react";
import { formatShortDuration } from "@/lib/utils";

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

  return (
    <>
      {!isMinimized && <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={isDone ? onClose : undefined} />}
      <div className={`fixed z-50 flex flex-col overflow-hidden border bg-[#f8fafc] shadow-2xl transition-all duration-300 ${
        isMinimized
          ? "bottom-20 left-3 right-3 h-auto rounded-xl border-slate-200/60 sm:bottom-4 sm:left-auto sm:w-[420px]"
          : "bottom-0 left-0 right-0 max-h-[90vh] w-full rounded-t-[24px] border-transparent lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[420px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:border-slate-200/60"
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200/50 bg-white p-5">
          <div>
            <h2 className="text-[17px] font-semibold text-slate-800">AI Brain Validation</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isMinimized && currentStep ? currentStep.description : "Memproses data klaim dan medical records..."}
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:bg-slate-50"
            >
              {isMinimized ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
            {isDone && (
              <button 
                onClick={onClose} 
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:bg-slate-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Body Timeline */}
        {!isMinimized && (
          <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#f8fafc] p-6 pr-4">
            <div className="relative">
              {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
              
              <div className="absolute bottom-4 left-[11px] top-4 w-[2px] bg-slate-200/80" />
              
              <div className="space-y-6">
                {steps.map((step, idx) => {
                   const isRunning = step.status === "running";
                   const isCompleted = step.status === "completed";
                   const isFailed = step.status === "failed";
                   const stepElapsed = isRunning && stepStartTimes.current[idx]
                     ? ((now - stepStartTimes.current[idx]) / 1000).toFixed(1)
                     : null;

                   return (
                     <div key={step.stepId} className={`relative flex items-start gap-4 transition-opacity duration-300 ${isFailed ? 'opacity-50' : 'opacity-100'}`}>
                       {/* Timeline Node */}
                       <div className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-[#f8fafc]">
                          {isCompleted ? (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                               <Check className="h-3.5 w-3.5 stroke-[3]" />
                            </div>
                          ) : isFailed ? (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                               <XCircle className="h-4 w-4" />
                            </div>
                          ) : isRunning ? (
                            <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-slate-300 border-t-slate-600" />
                          ) : (
                            <div className="h-3 w-3 rounded-full bg-slate-200" />
                          )}
                       </div>

                       {/* Step Content */}
                       <div className="flex flex-1 justify-between gap-4">
                          <div className="flex flex-col">
                             <h3 className={`tracking-tight text-[15px] ${isRunning || isCompleted ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                               {step.label}
                             </h3>
                             <p className={`mt-0.5 text-xs leading-relaxed ${isCompleted || isRunning ? 'text-slate-500' : 'text-slate-400/70'}`}>
                               {isFailed && step.error ? step.error : step.description}
                             </p>
                          </div>
                          <div className="shrink-0 pt-0.5 text-right">
                             <span className={`font-mono text-[13px] ${isRunning ? 'font-medium text-slate-800' : isCompleted ? 'text-slate-500' : 'text-transparent'}`}>
                               {isRunning && stepElapsed ? formatShortDuration(stepElapsed) : isCompleted && step.durationSec ? formatShortDuration(step.durationSec) : "-"}
                             </span>
                          </div>
                       </div>
                     </div>
                   );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer info when done but not minimized */}
        {isDone && !isMinimized && !error && (
          <div className="border-t border-slate-200 bg-slate-50 p-4 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <Loader2 className="h-4 w-4 animate-spin" /> Mengalihkan ke halaman hasil...
            </p>
          </div>
        )}
      </div>
    </>
  );
}
