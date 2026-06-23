"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, FileWarning, ShieldAlert } from "lucide-react";

import {
  buildHitlPacket,
  REVIEW_DECISION_LABELS,
  REVIEW_STATUS_LABELS,
  type HitlFinding,
  type ReviewDecisionRecord,
  type ReviewDecisionValue,
  type ReviewStatusValue,
} from "@/lib/hitl";
import { submitReviewDecision } from "../review/actions";

interface AdjudicationPanelProps {
  jobId: string;
  inputPayload: unknown;
  outputResult: unknown;
  reviewDecisions: ReviewDecisionRecord[];
}

const DECISION_OPTIONS: ReviewDecisionValue[] = [
  "APPROVE",
  "APPROVE_WITH_ADJUSTMENT",
  "REJECT",
  "REQUEST_DOCUMENTS",
  "ESCALATE_MEDICAL_ADVISOR",
];

const REASON_OPTIONS = [
  { value: "POLICY_EXCESS", label: "Excess polis / benefit" },
  { value: "MISSING_DOCUMENT", label: "Dokumen belum lengkap" },
  { value: "MEDICAL_REVIEW", label: "Butuh review medis" },
  { value: "TARIFF_ADJUSTMENT", label: "Koreksi tarif" },
  { value: "DRUG_PRICE_ADJUSTMENT", label: "Koreksi obat/farmalkes" },
  { value: "CLEAN_CLAIM", label: "Klaim bersih" },
  { value: "OTHER", label: "Lainnya" },
];

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function statusBadge(status: string) {
  if (status === "DECIDED") return <span className="rounded bg-green-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-green-700 ring-1 ring-inset ring-green-500/20">Diputuskan</span>;
  if (status === "WAITING_DOCUMENTS") return <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-blue-700 ring-1 ring-inset ring-blue-500/20">Menunggu dokumen</span>;
  if (status === "ESCALATED") return <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-red-700 ring-1 ring-inset ring-red-500/20">Eskalasi</span>;
  return <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700 ring-1 ring-inset ring-amber-500/20">Menunggu review</span>;
}

function findingTone(finding: HitlFinding): string {
  if (finding.severity === "REJECT_RECOMMENDED" || finding.severity === "REVIEW_NEEDED") return "border-red-200 bg-red-50/70";
  if (finding.severity === "WARNING") return "border-amber-200 bg-amber-50/70";
  return "border-slate-200 bg-slate-50";
}

function categoryLabel(category: HitlFinding["category"]): string {
  switch (category) {
    case "FWA": return "FWA";
    case "POLICY": return "Polis";
    case "TARIFF": return "Tarif";
    case "DRUG_PRICE": return "Obat";
    case "DOCUMENT": return "Dokumen";
    case "LOS": return "LOS";
    case "DIAGNOSIS": return "Klinis";
    default: return category;
  }
}

function findingIcon(finding: HitlFinding) {
  if (finding.category === "DOCUMENT") return <FileWarning className="h-4 w-4" />;
  if (finding.category === "DIAGNOSIS") return <ShieldAlert className="h-4 w-4" />;
  if (finding.severity === "INFO") return <CheckCircle2 className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

export default function AdjudicationPanel({ jobId, inputPayload, outputResult, reviewDecisions }: AdjudicationPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const packet = useMemo(() => {
    const p = buildHitlPacket(inputPayload, outputResult);
    
    // Urutkan findings berdasarkan urgency/severity
    const severityWeight: Record<string, number> = {
      "REJECT_RECOMMENDED": 4,
      "REVIEW_NEEDED": 3,
      "WARNING": 2,
      "INFO": 1
    };
    
    p.findings.sort((a, b) => {
      const weightA = severityWeight[a.severity] || 0;
      const weightB = severityWeight[b.severity] || 0;
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      const amountA = typeof a.amount === 'number' ? a.amount : 0;
      const amountB = typeof b.amount === 'number' ? b.amount : 0;
      return amountB - amountA;
    });
    
    return p;
  }, [inputPayload, outputResult]);
  const latestDecision = reviewDecisions[0] || null;
  const recommendedExcess = Math.max(0, packet.financialImpact.claimAmount - packet.financialImpact.recommendedPayableAmount);
  const hasFindings = packet.findings.length > 0;
  const evidencePacket = packet.evidencePacket;
  const topEvidenceItems = evidencePacket.items.slice(0, 8);
  const evidencePolicyLabel = evidencePacket.sourcePolicy === "LOCAL_WITH_DIAGNOSIS_EXTERNAL_EVIDENCE" ? "LOCAL + MEDICAL REFERENCES" : "LOCAL ONLY";

  function onSubmit(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const result = await submitReviewDecision(formData);
      if (!result.success) {
        setError(result.error || "Gagal menyimpan keputusan reviewer.");
        return;
      }
      router.replace("/dashboard/clinical-pathway/review");
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Meja review klaim</p>
            <h2 className="mt-2 text-2xl font-light tracking-tight text-foreground">Adjudication Workbench</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Fokuskan reviewer pada tiga hal: temuan yang harus dicek, dampak finansial, dan keputusan final yang bisa diaudit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(latestDecision?.nextReviewStatus || "OPEN")}
            <span className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
              Rekomendasi: {REVIEW_DECISION_LABELS[packet.recommendedAction]}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5 bg-white p-4 sm:p-5 xl:border-r xl:border-slate-200">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 ring-1 ring-inset ring-white/70">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary p-2 text-white">
                  <ClipboardCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Decision brief</p>
                  <p className="mt-2 text-base font-medium text-foreground">{packet.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Aksi sistem yang disarankan adalah <span className="font-medium text-foreground">{REVIEW_DECISION_LABELS[packet.recommendedAction]}</span>. Reviewer tetap dapat memilih keputusan berbeda dengan catatan alasan.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/35 p-4 ring-1 ring-inset ring-white/70">
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-amber-800/80">Rekonsiliasi finansial</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Total klaim</span><span className="font-mono text-foreground">{formatRupiah(packet.financialImpact.claimAmount)}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Excess policy</span><span className="font-mono text-red-600">{formatRupiah(packet.financialImpact.policyExcessAmount)}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Variance tarif/obat</span><span className="font-mono text-amber-700">{formatRupiah(packet.financialImpact.tariffVarianceAmount + packet.financialImpact.drugVarianceAmount)}</span></div>
                <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-3"><span className="font-medium text-foreground">Payable rekomendasi</span><span className="font-mono text-foreground">{formatRupiah(packet.financialImpact.recommendedPayableAmount)}</span></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>FWA</p><p className="mt-1 font-mono text-xl font-light text-foreground">{packet.counts.fwa}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>Polis</p><p className="mt-1 font-mono text-xl font-light text-foreground">{packet.counts.policy}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Tarif</p><p className="mt-1 font-mono text-xl font-light text-foreground">{packet.counts.tariff}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Obat</p><p className="mt-1 font-mono text-xl font-light text-foreground">{packet.counts.drugPrice}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>Dokumen</p><p className="mt-1 font-mono text-xl font-light text-foreground">{packet.counts.document}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>LOS</p><p className="mt-1 font-mono text-xl font-light text-foreground">{packet.counts.los}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>Klinis</p><p className="mt-1 font-mono text-xl font-light text-foreground">{packet.counts.diagnosis}</p></div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground"><BookOpen className="h-4 w-4" /> Evidence pendukung</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Snapshot bukti dari master lokal CONSUL. Khusus reasoning klinis diagnosis-tindakan dapat memuat referensi medis eksternal yang dicatat sebagai audit evidence.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{evidencePacket.summary.totalEvidence} bukti</span>
                <span className="rounded border border-border bg-card px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{evidencePolicyLabel}</span>
              </div>
            </div>

            {topEvidenceItems.length > 0 ? (
              <div className="divide-y divide-border/70">
                {topEvidenceItems.map((item) => (
                  <article key={item.id} className="px-4 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-600">{item.category}</span>
                          <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground ring-1 ring-inset ring-border">{item.source}</span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{item.confidence}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{item.evidenceText}</p>
                        {item.references && item.references.length > 0 && (
                          <div className="mt-2 space-y-1 rounded-md border border-slate-200 bg-white px-3 py-2">
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Referensi medis</p>
                            {item.references.slice(0, 3).map((reference, refIndex) => (
                              <p key={`${item.id}-ref-${refIndex}`} className="text-xs leading-5 text-slate-600">
                                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">{reference.sourceType}</span> · {reference.title}{reference.identifier ? ` · ${reference.identifier}` : ""}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">Rekomendasi: {item.recommendation}</p>
                      </div>
                      <div className="shrink-0 text-left lg:text-right">
                        {item.amount !== null && item.amount !== undefined && item.amount > 0 && <p className="font-mono text-sm text-amber-700">{formatRupiah(item.amount)}</p>}
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{new Date(item.accessedAt).toLocaleString("id-ID")}</p>
                      </div>
                    </div>
                  </article>
                ))}
                {evidencePacket.summary.totalEvidence > topEvidenceItems.length && (
                  <p className="px-4 py-3 text-xs text-muted-foreground">Menampilkan {topEvidenceItems.length} dari {evidencePacket.summary.totalEvidence} bukti. Bukti lengkap tersimpan dalam snapshot audit keputusan reviewer.</p>
                )}
              </div>
            ) : (
              <div className="p-4">
                <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">Belum ada bukti pendukung yang perlu ditampilkan untuk klaim ini.</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/20">
            <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Checklist review</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Urut dari temuan paling penting untuk keputusan adjudikasi.</p>
              </div>
              <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{packet.findings.length} item</span>
            </div>

            {hasFindings ? (
              <div className="divide-y divide-border/70">
                {packet.findings.map((finding, index) => (
                  <article key={`${finding.category}-${index}`} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 px-4 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card font-mono text-xs text-muted-foreground">{index + 1}</div>
                    <div className={`rounded-lg border p-4 sm:p-5 ${findingTone(finding)}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded bg-white/80 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground ring-1 ring-inset ring-black/5">
                              {findingIcon(finding)} {categoryLabel(finding.category)}
                            </span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{finding.severity}</span>
                          </div>
                          <p className="mt-3 text-sm font-medium leading-6 text-foreground">{finding.message}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{finding.recommendation}</p>
                        </div>
                        {typeof finding.amount === "number" && finding.amount > 0 && (
                          <div className="shrink-0 rounded-md bg-white/80 px-3 py-2 text-right ring-1 ring-inset ring-black/5">
                            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">Dampak</p>
                            <p className="mt-1 font-mono text-sm text-foreground">{formatRupiah(finding.amount)}</p>
                          </div>
                        )}
                      </div>

                      {finding.details && finding.details.length > 0 && (
                        <div className="mt-5 border-t border-black/5 pt-4">
                          {finding.details.some(d => typeof d === 'string') ? (
                            <ul className="list-inside list-disc space-y-1 rounded-md bg-white/50 px-3 py-2 text-xs text-muted-foreground">
                              {finding.details.map((detail, dIdx) => (
                                <li key={dIdx}>{typeof detail === 'string' ? detail : JSON.stringify(detail)}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="space-y-2">
                              {finding.details.map((detail, dIdx) => {
                                const detailRecord = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail as Record<string, unknown> : {};
                                const detailType = String(detailRecord.type || '');
                                const detailStatus = String(detailRecord.status || '');
                                const detailName = String(detailRecord.name || '-');
                                const detailCode = String(detailRecord.code || '-');
                                const detailQty = Number(detailRecord.qty || 1);
                                const claimedTotal = Number(detailRecord.claimedTotal || 0);
                                const claimedUnit = Number(detailRecord.claimedUnit || 0);
                                const expectedTotal = Number(detailRecord.expectedTotal || 0);
                                const expectedUnit = Number(detailRecord.expectedUnit || 0);
                                const variancePct = Number(detailRecord.variancePct || 0);
                                const varianceAmount = Number(detailRecord.varianceAmount || 0);

                                if (detailType === 'TARIFF' || detailType === 'DRUG') {
                                  const isOver = detailStatus === 'OVER_THRESHOLD' || detailStatus === 'OVER_PRICED';
                                  const isUnder = detailStatus === 'UNDER_PRICED';
                                  const isNotFound = detailStatus === 'NOT_FOUND';
                                  const badgeClass = isOver || isUnder
                                    ? 'bg-amber-100/50 text-amber-700 ring-amber-500/30'
                                    : isNotFound
                                      ? 'bg-orange-100/50 text-orange-700 ring-orange-500/30'
                                      : 'bg-slate-100 text-slate-600 ring-slate-200';
                                  const varianceColor = variancePct > 0 ? 'text-amber-600' : 'text-amber-500';

                                  return (
                                    <div key={dIdx} className="flex flex-col justify-between gap-4 rounded-md border border-amber-100 bg-amber-50/30 px-4 py-3 transition-colors hover:bg-amber-50/60 sm:flex-row sm:items-center">
                                      <div className="grid flex-1 grid-cols-2 items-center gap-4 md:grid-cols-5">
                                        <div className="col-span-2 min-w-0 md:col-span-1">
                                          <p className="truncate text-sm font-medium text-slate-700" title={detailName}>{detailName}</p>
                                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">{detailCode}</p>
                                        </div>
                                        <div className="text-left md:text-center"><p className="font-mono text-xs text-slate-500">{detailQty}</p></div>
                                        <div className="text-left md:text-right"><p className="font-mono text-sm text-slate-700">{new Intl.NumberFormat('id-ID').format(claimedTotal)}</p><p className="mt-0.5 font-mono text-[10px] text-slate-500">@ {new Intl.NumberFormat('id-ID').format(claimedUnit)}</p></div>
                                        <div className="text-left md:text-right"><p className="font-mono text-sm text-slate-700">{new Intl.NumberFormat('id-ID').format(expectedTotal)}</p><p className="mt-0.5 font-mono text-[10px] text-slate-500">@ {new Intl.NumberFormat('id-ID').format(expectedUnit)}</p></div>
                                        <div className="text-left md:text-right"><p className={`font-mono text-xs ${varianceColor}`}>{variancePct > 0 ? '+' : ''}{variancePct.toFixed(1)}%</p><p className={`mt-0.5 font-mono text-[10px] ${varianceColor}`}>{varianceAmount > 0 ? '+' : '-'}Rp {new Intl.NumberFormat('id-ID').format(Math.abs(varianceAmount))}</p></div>
                                      </div>
                                      <div className="flex min-w-[100px] shrink-0 items-center justify-end sm:justify-center">
                                        <span className={`inline-flex items-center rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ring-1 ring-inset ${badgeClass}`}>
                                          {isOver ? 'OVERCHARGE' : isUnder ? 'UNDERCHARGE' : isNotFound ? 'UNREGISTERED' : detailStatus}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                }

                                return <div key={dIdx} className="mt-1 text-xs text-muted-foreground">• {typeof detail === 'string' ? detail : JSON.stringify(detail)}</div>;
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Tidak ada temuan mayor. Reviewer bisa menyetujui klaim bila dokumen pendukung sudah sesuai.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="bg-slate-100/70 p-4 sm:p-5 xl:min-h-full">
          <div className="space-y-4 xl:sticky xl:top-20">
            <form action={onSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-inset ring-sky-50">
              <input type="hidden" name="jobId" value={jobId} />
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Keputusan final</p>
                  <p className="mt-1 text-sm text-muted-foreground">Simpan keputusan sebagai audit trail.</p>
                </div>
                {statusBadge(latestDecision?.nextReviewStatus || "OPEN")}
              </div>

              <div className="mt-4 space-y-4">
                <label className="block text-sm font-medium text-foreground">
                  Keputusan
                  <select name="decision" defaultValue={packet.recommendedAction} className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-base font-light text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/20 sm:text-sm">
                    {DECISION_OPTIONS.map((decision) => <option key={decision} value={decision}>{REVIEW_DECISION_LABELS[decision]}</option>)}
                  </select>
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="block text-sm font-medium text-foreground">
                    Payable final
                    <input name="payableAmount" type="number" min="0" defaultValue={Math.round(packet.financialImpact.recommendedPayableAmount)} className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-base font-light text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/20 sm:text-sm" />
                  </label>
                  <label className="block text-sm font-medium text-foreground">
                    Excess final
                    <input name="excessAmount" type="number" min="0" defaultValue={Math.round(recommendedExcess)} className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-base font-light text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/20 sm:text-sm" />
                  </label>
                </div>

                <label className="block text-sm font-medium text-foreground">
                  Reason code
                  <select name="reasonCode" defaultValue={packet.recommendedAction === "REQUEST_DOCUMENTS" ? "MISSING_DOCUMENT" : recommendedExcess > 0 ? "POLICY_EXCESS" : "CLEAN_CLAIM"} className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-base font-light text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/20 sm:text-sm">
                    {REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="block text-sm font-medium text-foreground">
                  Catatan reviewer
                  <textarea name="note" rows={5} placeholder="Tulis justifikasi keputusan, koreksi payable, atau dokumen yang harus diminta." className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-base font-light leading-6 text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/20 sm:text-sm" />
                </label>

                {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

                <button type="submit" disabled={isPending} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60">
                  {isPending ? "Menyimpan dan kembali ke queue..." : "Simpan Keputusan"}
                </button>
              </div>
            </form>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-inset ring-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Audit trail</p>
                  <p className="mt-1 text-sm text-muted-foreground">Riwayat keputusan reviewer.</p>
                </div>
                <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{reviewDecisions.length}</span>
              </div>

              <div className="mt-4 space-y-3">
                {reviewDecisions.length > 0 ? reviewDecisions.map((decision) => (
                  <div key={decision.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{REVIEW_DECISION_LABELS[decision.decision as ReviewDecisionValue] || decision.decision}</p>
                      {statusBadge(decision.nextReviewStatus)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{decision.reviewer?.name || decision.reviewer?.email || "Reviewer"} · {new Date(decision.createdAt).toLocaleString("id-ID")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Payable <span className="block font-mono text-foreground">{formatRupiah(decision.payableAmount || 0)}</span></span>
                      <span>Excess <span className="block font-mono text-red-600">{formatRupiah(decision.excessAmount || 0)}</span></span>
                    </div>
                    {decision.reasonCode && <p className="mt-2 text-xs text-muted-foreground">Reason: <span className="font-mono text-foreground">{decision.reasonCode}</span></p>}
                    {decision.note && <p className="mt-2 text-sm leading-6 text-muted-foreground">{decision.note}</p>}
                  </div>
                )) : (
                  <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">Belum ada keputusan reviewer.</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
