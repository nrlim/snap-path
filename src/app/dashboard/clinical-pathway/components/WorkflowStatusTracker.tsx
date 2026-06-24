"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Stethoscope,
  DollarSign,
  Pill,
  Clock,
  BrainCircuit,
  ShieldCheck,
  BarChart3,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface WorkflowStep {
  stepId: string;
  label: string;
  description: string;
  icon: React.ElementType;
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
  AGGREGATE: 7,
  PRE_PROCESSING: -1,
  POST_PROCESSING: -1,
  PROCESSING: -1,
};

const INITIAL_STEPS: Omit<WorkflowStep, "status" | "durationSec" | "error">[] = [
  {
    stepId: "init",
    label: "Inisialisasi",
    description: "Memvalidasi data awal dan menyiapkan job validasi klaim...",
    icon: FileText,
  },
  {
    stepId: "doc-val",
    label: "Validasi Dokumen",
    description: "Mengecek kelengkapan berkas pendukung klaim...",
    icon: FileText,
  },
  {
    stepId: "diag-val",
    label: "Validasi Diagnosis",
    description: "Menganalisis kesesuaian diagnosis dan tindakan medis (ICD-10)...",
    icon: Stethoscope,
  },
  {
    stepId: "tariff-val",
    label: "Validasi Tarif",
    description: "Mengecek kewajaran harga tindakan medis terhadap tarif rujukan...",
    icon: DollarSign,
  },
  {
    stepId: "drug-val",
    label: "Cek Harga Obat",
    description: "Memvalidasi kesesuaian harga obat dengan HET dan master data...",
    icon: Pill,
  },
  {
    stepId: "los-val",
    label: "Validasi Lama Rawat (LOS)",
    description: "Memvalidasi kesesuaian Length of Stay berdasarkan diagnosis dan pathway...",
    icon: Clock,
  },
  {
    stepId: "pathway-gen",
    label: "Generate Clinical Pathway",
    description: "Menyusun standar clinical pathway berdasarkan diagnosis utama...",
    icon: BrainCircuit,
  },
  {
    stepId: "policy-val",
    label: "Validasi Policy & Benefit",
    description: "Memeriksa kesesuaian klaim terhadap aturan polis dan manfaat...",
    icon: ShieldCheck,
  },
  {
    stepId: "aggregate",
    label: "Agregasi Hasil",
    description: "Menyelesaikan validasi dan menghitung skor akhir klaim...",
    icon: BarChart3,
  },
];

function makeInitialSteps(): WorkflowStep[] {
  return INITIAL_STEPS.map((s) => ({ ...s, status: "waiting" as const }));
}

export default function WorkflowStatusTracker({
  jobId,
  workflowRunId,
  currentDbStatus,
  onCompleted,
  onFailed,
}: WorkflowStatusTrackerProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>(makeInitialSteps);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [, setTicker] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnimRef = useRef<NodeJS.Timeout | null>(null);
  const currentIdxRef = useRef(0);
  const targetIdxRef = useRef(0);
  const stepStartTimes = useRef<Record<number, number>>({ 0: Date.now() });
  const stoppedRef = useRef(false);

  // Live ticker for running step duration
  useEffect(() => {
    const tick = setInterval(() => setTicker((t) => t + 1), 100);
    return () => clearInterval(tick);
  }, []);

  function applyStepProgress(effectiveIdx: number) {
    const now = Date.now();
    if (!stepStartTimes.current[effectiveIdx]) {
      stepStartTimes.current[effectiveIdx] = now;
    }
    currentIdxRef.current = effectiveIdx;
    setCurrentStepIdx(effectiveIdx);
    setSteps((prev) =>
      prev.map((step, idx) => {
        if (idx < effectiveIdx) {
          const start = stepStartTimes.current[idx] || now;
          const dur = step.durationSec ?? ((now - start) / 1000).toFixed(1);
          return { ...step, status: "completed", durationSec: dur };
        }
        if (idx === effectiveIdx) return { ...step, status: "running" };
        return { ...step, status: "waiting" };
      })
    );
  }

  function advanceToStep(targetIdx: number) {
    targetIdxRef.current = Math.max(targetIdx, targetIdxRef.current, currentIdxRef.current);
    if (progressAnimRef.current) return;

    const advance = () => {
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

  function markAllCompleted() {
    const now = Date.now();
    if (progressAnimRef.current) {
      clearTimeout(progressAnimRef.current);
      progressAnimRef.current = null;
    }
    setSteps((prev) =>
      prev.map((step, idx) => {
        const start = stepStartTimes.current[idx] || now;
        const dur = step.durationSec ?? ((now - start) / 1000).toFixed(1);
        return { ...step, status: "completed", durationSec: dur };
      })
    );
  }

  function markFailed(errorMsg: string) {
    const failIdx = currentIdxRef.current;
    if (progressAnimRef.current) {
      clearTimeout(progressAnimRef.current);
      progressAnimRef.current = null;
    }
    setSteps((prev) =>
      prev.map((step, idx) =>
        idx === failIdx ? { ...step, status: "failed", error: errorMsg } : step
      )
    );
  }

  useEffect(() => {
    stoppedRef.current = false;

    // Seed step progress from DB status on mount
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
          // /api/v1/claims/poll response shape: { status: 'running'|'completed'|'failed', jobStatus?, result? }
          const wfStatus = data.status as string;

          if (wfStatus === "running") {
            const dbStatus = (data.jobStatus as string) ?? "PROCESSING";
            const mappedIdx = JOB_STATUS_TO_STEP_IDX[dbStatus];
            const stepIdx =
              mappedIdx === undefined || mappedIdx === -1
                ? currentIdxRef.current
                : mappedIdx;
            advanceToStep(stepIdx);
          } else if (wfStatus === "completed") {
            clearInterval(intervalRef.current!);
            markAllCompleted();
            // Small delay so user sees all steps green before page refresh
            setTimeout(() => {
              onCompleted(data);
            }, 800);
          } else if (wfStatus === "failed" || wfStatus === "not_found") {
            clearInterval(intervalRef.current!);
            const errMsg =
              typeof data.error === "string"
                ? data.error
                : "Workflow gagal. Silakan coba lagi.";
            markFailed(errMsg);
            setTimeout(() => onFailed(errMsg), 400);
          }
        } else {
          // /api/v1/jobs/[jobId]/status response shape: { status, errorMessage? }
          const dbStatus = data.status as string;

          if (dbStatus === "COMPLETED") {
            clearInterval(intervalRef.current!);
            markAllCompleted();
            setTimeout(() => onCompleted(data), 800);
          } else if (dbStatus === "FAILED") {
            clearInterval(intervalRef.current!);
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
        // Ignore transient poll errors
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
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.15em] text-slate-500">
            AI Validation Engine
          </p>
          <h2 className="mt-1 text-lg font-medium text-slate-800">
            Sedang Memproses Klaim
          </h2>
        </div>
        <div className="text-right">
          <div className="text-2xl font-light tabular-nums text-primary">
            {elapsedSec}
            <span className="text-sm font-normal text-muted-foreground ml-0.5">s</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">waktu berjalan</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-primary transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps */}
      <div className="p-6 space-y-1">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isRunning = step.status === "running";
          const isCompleted = step.status === "completed";
          const isFailed = step.status === "failed";
          const isWaiting = step.status === "waiting";

          const stepElapsed =
            isRunning && stepStartTimes.current[idx]
              ? ((now - stepStartTimes.current[idx]) / 1000).toFixed(1)
              : null;

          return (
            <div key={step.stepId} className="flex items-start gap-4 py-3">
              {/* Connector line */}
              <div className="relative flex flex-col items-center shrink-0">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isCompleted
                      ? "border-emerald-500 bg-emerald-50"
                      : isFailed
                      ? "border-rose-500 bg-rose-50"
                      : isRunning
                      ? "border-primary bg-primary/5"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  {isCompleted && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  {isFailed && <XCircle className="h-4 w-4 text-rose-600" />}
                  {isRunning && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {isWaiting && (
                    <Icon className="h-3.5 w-3.5 text-slate-300" />
                  )}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`mt-1 w-px flex-1 transition-colors duration-300 ${
                      isCompleted ? "bg-emerald-300" : "bg-slate-200"
                    }`}
                    style={{ height: 24 }}
                  />
                )}
              </div>

              {/* Step content */}
              <div
                className={`flex-1 min-w-0 transition-opacity duration-300 ${
                  isWaiting ? "opacity-40" : "opacity-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm font-medium ${
                      isFailed
                        ? "text-rose-700"
                        : isCompleted
                        ? "text-emerald-700"
                        : isRunning
                        ? "text-slate-800"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  <div className="shrink-0 flex items-center gap-2">
                    {isRunning && stepElapsed && (
                      <span className="text-xs font-mono text-primary">
                        {stepElapsed}s
                      </span>
                    )}
                    {isCompleted && step.durationSec && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {step.durationSec}s
                      </span>
                    )}
                    {isCompleted && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                        selesai
                      </span>
                    )}
                    {isFailed && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/20">
                        gagal
                      </span>
                    )}
                    {isRunning && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                        berjalan
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {isFailed && step.error ? step.error : step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="border-t border-slate-200 bg-slate-50 px-6 py-3">
        <p className="text-xs text-muted-foreground text-center">
          Halaman ini akan diperbarui otomatis ketika validasi selesai
        </p>
      </div>
    </div>
  );
}
