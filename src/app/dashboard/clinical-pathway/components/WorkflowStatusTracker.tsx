"use client";

import type { ComponentType, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  Pill,
  ShieldCheck,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { formatShortDuration } from "@/lib/utils";

interface WorkflowStep {
  stepId: string;
  label: string;
  description: string;
  phase: "intake" | "clinical" | "financial" | "decision";
  icon: ComponentType<{ className?: string }>;
  status: "waiting" | "running" | "completed" | "failed";
  durationSec?: string;
  error?: string;
}

interface WorkflowStatusTrackerProps {
  jobId: string;
  workflowRunId: string | null;
  currentDbStatus: string;
  onCompleted: (jobData: Record<string, unknown>) => void;
  onFailed: (errorMsg: string) => void;
}

const JOB_STATUS_TO_STEP_IDX: Record<string, number> = {
  QUEUED: 0,
  INIT: 0,
  DOC_VAL: 1,
  DIAG_VAL: 2,
  TARIFF_VAL: 3,
  DRUG_VAL: 4,
  LOS_VAL: 5,
  PATHWAY_GEN: 6,
  POLICY_VAL: 7,
  AGGREGATE: 8,
  PRE_PROCESSING: -1,
  POST_PROCESSING: -1,
  PROCESSING: -1,
};

const INITIAL_STEPS: Omit<WorkflowStep, "status" | "durationSec" | "error">[] = [
  {
    stepId: "init",
    label: "Inisialisasi",
    description: "Memvalidasi data awal, identitas klaim, dan konfigurasi proses.",
    phase: "intake",
    icon: FileText,
  },
  {
    stepId: "doc-val",
    label: "Validasi dokumen",
    description: "Mengecek kelengkapan berkas pendukung klaim.",
    phase: "intake",
    icon: FileText,
  },
  {
    stepId: "diag-val",
    label: "Validasi diagnosis",
    description: "Menganalisis kesesuaian diagnosis dan tindakan medis ICD-10.",
    phase: "clinical",
    icon: Stethoscope,
  },
  {
    stepId: "tariff-val",
    label: "Validasi tarif",
    description: "Mengecek kewajaran biaya tindakan terhadap master tarif penyedia layanan.",
    phase: "financial",
    icon: DollarSign,
  },
  {
    stepId: "drug-val",
    label: "Cek harga obat",
    description: "Memvalidasi harga obat dan farmalkes dengan master data rujukan.",
    phase: "financial",
    icon: Pill,
  },
  {
    stepId: "los-val",
    label: "Validasi LOS",
    description: "Membandingkan lama rawat aktual dengan estimasi pathway.",
    phase: "clinical",
    icon: Clock,
  },
  {
    stepId: "pathway-gen",
    label: "Pembuatan pathway klinis",
    description: "Menyusun pathway klinis berdasarkan diagnosis utama dan konteks episode.",
    phase: "clinical",
    icon: BrainCircuit,
  },
  {
    stepId: "policy-val",
    label: "Polis & manfaat",
    description: "Memeriksa kesesuaian klaim terhadap aturan polis dan manfaat.",
    phase: "decision",
    icon: ShieldCheck,
  },
  {
    stepId: "aggregate",
    label: "Agregasi hasil",
    description: "Menggabungkan seluruh temuan dan menghitung skor akhir klaim.",
    phase: "decision",
    icon: BarChart3,
  },
];

function makeInitialSteps(): WorkflowStep[] {
  return INITIAL_STEPS.map((step) => ({ ...step, status: "waiting" as const }));
}


export default function WorkflowStatusTracker({
  jobId,
  workflowRunId,
  currentDbStatus,
  onCompleted,
  onFailed,
}: WorkflowStatusTrackerProps): ReactElement {
  const [steps, setSteps] = useState<WorkflowStep[]>(makeInitialSteps);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [, setTicker] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnimRef = useRef<NodeJS.Timeout | null>(null);
  const currentIdxRef = useRef(0);
  const targetIdxRef = useRef(0);
  const stepStartTimes = useRef<Record<number, number>>({ 0: Date.now() });
  const stoppedRef = useRef(false);

  useEffect(() => {
    const tick = setInterval(() => setTicker((value) => value + 1), 100);
    return () => clearInterval(tick);
  }, []);

  function applyStepProgress(effectiveIdx: number): void {
    const now = Date.now();
    if (!stepStartTimes.current[effectiveIdx]) {
      stepStartTimes.current[effectiveIdx] = now;
    }
    currentIdxRef.current = effectiveIdx;
    setCurrentStepIdx(effectiveIdx);
    setSteps((previousSteps) =>
      previousSteps.map((step, idx) => {
        if (idx < effectiveIdx) {
          const start = stepStartTimes.current[idx] || now;
          const duration = step.durationSec ?? ((now - start) / 1000).toFixed(1);
          return { ...step, status: "completed", durationSec: duration };
        }
        if (idx === effectiveIdx) return { ...step, status: "running" };
        return { ...step, status: "waiting" };
      })
    );
  }

  function advanceToStep(targetIdx: number): void {
    targetIdxRef.current = Math.max(targetIdx, targetIdxRef.current, currentIdxRef.current);
    if (progressAnimRef.current) return;

    const advance = (): void => {
      const current = currentIdxRef.current;
      const target = targetIdxRef.current;
      const next = target > current ? current + 1 : target;
      applyStepProgress(next);
      if (targetIdxRef.current > next) {
        progressAnimRef.current = setTimeout(advance, 600);
      } else {
        progressAnimRef.current = null;
      }
    };
    advance();
  }

  function markAllCompleted(): void {
    const now = Date.now();
    if (progressAnimRef.current) {
      clearTimeout(progressAnimRef.current);
      progressAnimRef.current = null;
    }
    setSteps((previousSteps) =>
      previousSteps.map((step, idx) => {
        const start = stepStartTimes.current[idx] || now;
        const duration = step.durationSec ?? ((now - start) / 1000).toFixed(1);
        return { ...step, status: "completed", durationSec: duration };
      })
    );
  }

  function markFailed(errorMsg: string): void {
    const failIdx = currentIdxRef.current;
    if (progressAnimRef.current) {
      clearTimeout(progressAnimRef.current);
      progressAnimRef.current = null;
    }
    setSteps((previousSteps) =>
      previousSteps.map((step, idx) =>
        idx === failIdx ? { ...step, status: "failed", error: errorMsg } : step
      )
    );
  }

  useEffect(() => {
    stoppedRef.current = false;

    const initialIdx = JOB_STATUS_TO_STEP_IDX[currentDbStatus];
    if (initialIdx !== undefined && initialIdx >= 0) {
      advanceToStep(initialIdx);
    }

    const pollUrl = workflowRunId
      ? `/api/v1/claims/poll?runId=${workflowRunId}&jobId=${jobId}`
      : `/api/v1/jobs/${jobId}/status`;

    const useClaimsPoll = Boolean(workflowRunId);

    intervalRef.current = setInterval(async () => {
      if (stoppedRef.current) return;

      try {
        const res = await fetch(pollUrl);
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;

        if (useClaimsPoll) {
          const workflowStatus = data.status as string;

          if (workflowStatus === "running") {
            const dbStatus = (data.jobStatus as string) ?? "PROCESSING";
            const mappedIdx = JOB_STATUS_TO_STEP_IDX[dbStatus];
            const stepIdx =
              mappedIdx === undefined || mappedIdx === -1
                ? currentIdxRef.current
                : mappedIdx;
            advanceToStep(stepIdx);
          } else if (workflowStatus === "completed") {
            if (intervalRef.current) clearInterval(intervalRef.current);
            markAllCompleted();
            setTimeout(() => {
              onCompleted(data);
            }, 800);
          } else if (workflowStatus === "failed" || workflowStatus === "not_found") {
            if (intervalRef.current) clearInterval(intervalRef.current);
            const errMsg =
              typeof data.error === "string"
                ? data.error
                : "Workflow gagal. Silakan coba lagi.";
            markFailed(errMsg);
            setTimeout(() => onFailed(errMsg), 400);
          }
        } else {
          const dbStatus = data.status as string;

          if (dbStatus === "COMPLETED") {
            if (intervalRef.current) clearInterval(intervalRef.current);
            markAllCompleted();
            setTimeout(() => onCompleted(data), 800);
          } else if (dbStatus === "FAILED") {
            if (intervalRef.current) clearInterval(intervalRef.current);
            const errMsg =
              typeof data.errorMessage === "string"
                ? data.errorMessage
                : "Workflow gagal. Silakan coba lagi.";
            markFailed(errMsg);
            setTimeout(() => onFailed(errMsg), 400);
          } else {
            const mappedIdx = JOB_STATUS_TO_STEP_IDX[dbStatus];
            if (mappedIdx !== undefined && mappedIdx >= 0) {
              advanceToStep(mappedIdx);
            }
          }
        }
      } catch {
        // Ignore transient poll errors.
      }
    }, 2500);

    return () => {
      stoppedRef.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressAnimRef.current) clearTimeout(progressAnimRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, workflowRunId]);

  const now = Date.now();
  const elapsedSec = ((now - startedAt) / 1000).toFixed(1);
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const hasRunningStep = steps.some((step) => step.status === "running");
  const progressPct = Math.min(100, Math.round(((completedCount + (hasRunningStep ? 0.5 : 0)) / steps.length) * 100));
  const safeCurrentStepIdx = Math.min(currentStepIdx, steps.length - 1);
  const currentStep = steps.find((step) => step.status === "running" || step.status === "failed") ?? steps[safeCurrentStepIdx];
  const CurrentIcon = currentStep.icon;
  const currentStepElapsed = stepStartTimes.current[safeCurrentStepIdx]
    ? ((now - stepStartTimes.current[safeCurrentStepIdx]) / 1000).toFixed(1)
    : elapsedSec;

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-[#f8fafc] shadow-2xl transition-all duration-300 ${isMinimized ? 'h-auto' : 'max-h-[600px]'}`}>
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200/50 bg-white p-5">
        <div>
          <h2 className="text-[17px] font-semibold text-slate-800">AI Brain Validation</h2>
          <p className="mt-1 text-sm text-slate-500">Memproses data klaim dan medical records...</p>
        </div>
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:bg-slate-50"
        >
           {isMinimized ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
      </div>

      {/* Body Timeline */}
      {!isMinimized && (
        <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#f8fafc] p-6 pr-4">
          <div className="relative">
            {/* The line connecting dots */}
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
    </div>
  );
}
