import Link from 'next/link'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { applyClaimDisplayMetadataToJob } from '@/lib/claim-display'
import { getAuthenticatedUser, isPlatformAdminRole } from '@/lib/rbac'

const DEFAULT_PRICING = { inputPerMillion: 0.15, outputPerMillion: 0.6 }
const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
}

const SERVICE_COST_MULTIPLIER = 2
const USD_TO_IDR = 16_000

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getPricing(model: string | null) {
  if (!model) return DEFAULT_PRICING
  return MODEL_PRICING[model] || DEFAULT_PRICING
}

function estimateServiceCostIdr(log: { aiModel: string | null; inputTokens: number; outputTokens: number }) {
  const pricing = getPricing(log.aiModel)
  const baseUsd = ((log.inputTokens / 1_000_000) * pricing.inputPerMillion) + ((log.outputTokens / 1_000_000) * pricing.outputPerMillion)
  return baseUsd * SERVICE_COST_MULTIPLIER * USD_TO_IDR
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(Math.round(value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(value)
}

function getDiagnosisFindingCounts(outputResult: unknown) {
  const output = asRecord(outputResult)
  const diagnosisValidation = asRecord(output?.diagnosisValidation)
  const details = Array.isArray(diagnosisValidation?.details)
    ? diagnosisValidation.details
    : Array.isArray(output?.diagnosisValidations)
      ? output.diagnosisValidations
      : []

  return details.reduce((counts: { missing: number; relevance: number; medication: number }, rawDetail) => {
    const detail = asRecord(rawDetail)
    const medicationFindings = Array.isArray(detail?.medicationFindings) ? detail.medicationFindings : []
    counts.missing += Array.isArray(detail?.missingRequiredProcedures) ? detail.missingRequiredProcedures.length : 0
    counts.relevance += Array.isArray(detail?.irrelevantProcedures)
      ? detail.irrelevantProcedures.length
      : Array.isArray(detail?.unmatchedProcedures)
        ? detail.unmatchedProcedures.length
        : 0
    counts.medication += medicationFindings.filter((item) => {
      const status = asRecord(item)?.status
      return status === 'REVIEW_NEEDED' || status === 'INAPPROPRIATE'
    }).length
    return counts
  }, { missing: 0, relevance: 0, medication: 0 })
}

function getDisplayScore(outputResult: unknown): number | null {
  const output = asRecord(outputResult)
  const rawScore = numberValue(output?.overallScore) ?? numberValue(output?.validationScore) ?? numberValue(output?.score)
  const scoreBreakdown = asRecord(output?.scoreBreakdown)
  const items = Array.isArray(scoreBreakdown?.items) ? scoreBreakdown.items : []
  if (items.length === 0) return rawScore

  const diagnosisValidation = asRecord(output?.diagnosisValidation)
  const findings = getDiagnosisFindingCounts(outputResult)
  const hasDiagnosisFindings = findings.missing > 0 || findings.relevance > 0 || findings.medication > 0

  return items.reduce((total, rawItem) => {
    const item = asRecord(rawItem)
    const maxScore = numberValue(item?.maxScore) ?? numberValue(item?.maxDeduction) ?? 0
    const deducted = numberValue(item?.deducted) ?? 0
    const isDiagnosisItem = item?.code === 'DIAGNOSIS_TREATMENT' || item?.label === 'Diagnosis, tindakan & obat klinis'
    const shouldClearHiddenDiagnosisDeduction = isDiagnosisItem && deducted > 0 && diagnosisValidation?.isValid === true && !hasDiagnosisFindings
    const score = shouldClearHiddenDiagnosisDeduction
      ? maxScore
      : numberValue(item?.score) ?? Math.max(0, maxScore - deducted)
    return total + score
  }, 0)
}

function getDiagnosis(inputPayload: unknown, outputResult: unknown) {
  const input = asRecord(inputPayload)
  const output = asRecord(outputResult)
  return stringValue(input?.diagnosisName)
    ?? stringValue(input?.diagnosisCode)
    ?? stringValue(asRecord(output?.clinicalPathway)?.diagnosisName)
    ?? 'Validasi klaim'
}

function getPatientName(inputPayload: unknown) {
  const patient = asRecord(asRecord(inputPayload)?.patient)
  return stringValue(patient?.name) ?? 'Pasien'
}

function getStatusTone(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-500/10 text-green-700 ring-green-600/20'
    case 'FAILED':
      return 'bg-red-500/10 text-red-700 ring-red-600/20'
    case 'PROCESSING':
    case 'PRE_PROCESSING':
    case 'POST_PROCESSING':
      return 'bg-sky-500/10 text-sky-700 ring-sky-600/20'
    default:
      return 'bg-orange-500/10 text-orange-700 ring-orange-600/20'
  }
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ trend?: string | string[] }>;
}) {
  const searchParams = await props.searchParams
  const trendParam = Array.isArray(searchParams.trend) ? searchParams.trend[0] : searchParams.trend
  const trendMode = trendParam === 'monthly' ? 'monthly' : 'weekly'
  const trendDays = trendMode === 'monthly' ? 30 : 7
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const isPlatformAdmin = isPlatformAdminRole(user.role)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const trendStart = new Date(now)
  trendStart.setDate(now.getDate() - (trendDays - 1))
  trendStart.setHours(0, 0, 0, 0)

  const scopedClientWhere = isPlatformAdmin ? {} : { clientId: user.clientId || '__none__' }
  const tariffWhere = isPlatformAdmin
    ? {}
    : user.clientId
      ? { provider: { clientId: user.clientId } }
      : { providerId: '__none__' }
  const sourceWhere = isPlatformAdmin
    ? { isActive: true }
    : { clientId: user.clientId || '__none__', isActive: true }

  const [
    monthJobs,
    recentJobs,
    trendJobs,
    aiUsageLogs,
    activeTariffs,
    activeSources,
    activeApiKeys,
    teamUsers,
  ] = await Promise.all([
    prisma.claimJob.findMany({
      where: { ...scopedClientWhere, jobType: 'CLAIM_VALIDATION', createdAt: { gte: monthStart } },
      select: { id: true, status: true, outputResult: true, startedAt: true, completedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.claimJob.findMany({
      where: { ...scopedClientWhere, jobType: 'CLAIM_VALIDATION' },
      select: { id: true, status: true, inputPayload: true, outputResult: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.claimJob.findMany({
      where: { ...scopedClientWhere, jobType: 'CLAIM_VALIDATION', createdAt: { gte: trendStart } },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    prisma.apiUsageLog.findMany({
      where: { ...scopedClientWhere, requestType: 'AI', createdAt: { gte: monthStart } },
      select: { aiModel: true, inputTokens: true, outputTokens: true, totalTokens: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.tariffEntry.count({ where: { ...tariffWhere, isActive: true } }),
    prisma.provider.count({ where: sourceWhere }),
    prisma.apiKey.count({ where: { ...scopedClientWhere, isActive: true } }),
    prisma.user.count({ where: scopedClientWhere }),
  ])

  const completedJobs = monthJobs.filter((job) => job.status === 'COMPLETED').length
  const failedJobs = monthJobs.filter((job) => job.status === 'FAILED').length
  const inProgressJobs = monthJobs.filter((job) => !['COMPLETED', 'FAILED'].includes(job.status)).length
  const scores = monthJobs.map((job) => getDisplayScore(job.outputResult)).filter((score): score is number => score !== null)
  const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
  const totalTokens = aiUsageLogs.reduce((sum, log) => sum + log.totalTokens, 0)
  const serviceUsageCost = aiUsageLogs.reduce((sum, log) => sum + estimateServiceCostIdr(log), 0)

  const trendPoints = Array.from({ length: trendDays }, (_, index) => {
    const date = new Date(trendStart)
    date.setDate(trendStart.getDate() + index)
    const nextDate = new Date(date)
    nextDate.setDate(date.getDate() + 1)
    const count = trendJobs.filter((job) => job.createdAt >= date && job.createdAt < nextDate).length
    return {
      label: trendMode === 'monthly'
        ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(date)
        : new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date),
      count,
    }
  })
  const maxTrendCount = Math.max(1, ...trendPoints.map((item) => item.count))
  const chartWidth = 320
  const chartHeight = 128
  const chartPadding = 12
  const chartStep = trendPoints.length > 1 ? (chartWidth - chartPadding * 2) / (trendPoints.length - 1) : 0
  const chartCoordinates = trendPoints.map((item, index) => {
    const x = chartPadding + (index * chartStep)
    const y = chartHeight - chartPadding - ((item.count / maxTrendCount) * (chartHeight - chartPadding * 2))
    return { ...item, x, y }
  })
  const chartLinePoints = chartCoordinates.map((item) => `${item.x},${item.y}`).join(' ')
  const chartAreaPoints = chartCoordinates.length > 0
    ? `${chartPadding},${chartHeight - chartPadding} ${chartLinePoints} ${chartWidth - chartPadding},${chartHeight - chartPadding}`
    : ''
  const trendTotal = trendPoints.reduce((sum, item) => sum + item.count, 0)

  const summaryCards = [
    { label: 'Validasi bulan ini', value: formatNumber(monthJobs.length), helper: `${completedJobs} selesai, ${inProgressJobs} berjalan`, tone: 'text-primary' },
    { label: 'Skor rata-rata', value: scores.length ? `${Math.round(averageScore)}/100` : 'Belum ada', helper: 'Rata-rata hasil validasi klaim', tone: 'text-secondary' },
    { label: 'Estimasi pemakaian layanan', value: formatCurrency(serviceUsageCost), helper: `${formatNumber(totalTokens)} unit pemrosesan`, tone: 'text-accent-foreground' },
    { label: 'Master data aktif', value: formatNumber(activeTariffs), helper: `${activeSources} sumber data, ${activeApiKeys} kredensial aktif`, tone: 'text-text' },
  ]

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-primary/15 bg-surface-elevated/90 shadow-sm shadow-primary/10 backdrop-blur-sm">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">Dashboard Operasional</p>
            <h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-text sm:text-3xl">
              Ringkasan validasi klaim dan kesiapan data bulan ini.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-subtle">
              Pantau volume workflow, kualitas hasil validasi, estimasi pemakaian layanan, dan kesiapan master data tanpa menampilkan detail teknis engine internal.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard/clinical-pathway" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2">
                Buka Clinical Pathway
              </Link>
              <Link href="/dashboard/master-data/buku-tarif" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text focus:outline-none focus:ring-2 focus:ring-primary/30">
                Cek Master Data
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Status bulan berjalan</p>
                <p className="mt-1 text-xs text-text-subtle">Periode {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(now)}</p>
              </div>
              <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary ring-1 ring-primary/15">Aktif</span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-green-500/10 p-3">
                <p className="text-lg font-bold tabular-nums text-green-700">{completedJobs}</p>
                <p className="text-[11px] font-medium text-green-700">Selesai</p>
              </div>
              <div className="rounded-xl bg-sky-500/10 p-3">
                <p className="text-lg font-bold tabular-nums text-sky-700">{inProgressJobs}</p>
                <p className="text-[11px] font-medium text-sky-700">Berjalan</p>
              </div>
              <div className="rounded-xl bg-red-500/10 p-3">
                <p className="text-lg font-bold tabular-nums text-red-700">{failedJobs}</p>
                <p className="text-[11px] font-medium text-red-700">Gagal</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border/80 bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-faint">{card.label}</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${card.tone}`}>{card.value}</p>
            <p className="mt-2 text-xs leading-5 text-text-subtle">{card.helper}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-text">Tren workflow</h2>
              <p className="mt-1 text-sm text-text-subtle">{trendTotal} validasi dalam {trendMode === 'monthly' ? '30 hari terakhir' : '7 hari terakhir'}.</p>
            </div>
            <div className="inline-flex rounded-full border border-border bg-surface-elevated p-1">
              <Link href="/dashboard?trend=weekly" className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${trendMode === 'weekly' ? 'bg-primary text-white shadow-sm' : 'text-text-subtle hover:text-text'}`}>Mingguan</Link>
              <Link href="/dashboard?trend=monthly" className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${trendMode === 'monthly' ? 'bg-primary text-white shadow-sm' : 'text-text-subtle hover:text-text'}`}>Bulanan</Link>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-border/60 bg-surface-elevated/40 p-4" aria-label={`Grafik workflow ${trendMode === 'monthly' ? 'bulanan' : 'mingguan'}`}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full overflow-visible" role="img" aria-label="Line chart jumlah workflow validasi">
              <defs>
                <linearGradient id="workflowTrendArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((line) => {
                const y = chartPadding + (line * ((chartHeight - chartPadding * 2) / 3))
                return <line key={line} x1={chartPadding} x2={chartWidth - chartPadding} y1={y} y2={y} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 6" />
              })}
              {chartAreaPoints && <polygon points={chartAreaPoints} fill="url(#workflowTrendArea)" />}
              {chartLinePoints && <polyline points={chartLinePoints} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
              {chartCoordinates.map((item, index) => (
                <g key={`${item.label}-${index}`}>
                  <circle cx={item.x} cy={item.y} r="4" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="2.5" />
                  {(trendMode === 'weekly' || index === 0 || index === chartCoordinates.length - 1 || index % 7 === 0) && (
                    <text x={item.x} y={chartHeight + 6} textAnchor="middle" className="fill-[var(--color-text-subtle)] text-[10px] font-medium">{item.label}</text>
                  )}
                </g>
              ))}
            </svg>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-surface p-3 ring-1 ring-border/70">
                <p className="text-xs text-text-subtle">Total</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-text">{trendTotal}</p>
              </div>
              <div className="rounded-xl bg-surface p-3 ring-1 ring-border/70">
                <p className="text-xs text-text-subtle">Tertinggi</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-primary">{maxTrendCount}</p>
              </div>
              <div className="rounded-xl bg-surface p-3 ring-1 ring-border/70">
                <p className="text-xs text-text-subtle">Rata-rata</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-secondary">{(trendTotal / trendDays).toFixed(1)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 p-5">
            <div>
              <h2 className="text-base font-bold text-text">Aktivitas terbaru</h2>
              <p className="mt-1 text-sm text-text-subtle">Ringkasan klaim terakhir yang diproses.</p>
            </div>
            <Link href="/dashboard/clinical-pathway" className="text-sm font-semibold text-primary hover:text-primary-hover">Lihat semua</Link>
          </div>
          <div className="divide-y divide-border/60">
            {recentJobs.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-text">Belum ada aktivitas</p>
                <p className="mt-1 text-sm text-text-subtle">Mulai validasi klaim untuk melihat histori workflow di sini.</p>
              </div>
            ) : recentJobs.map((rawJob) => {
              const job = applyClaimDisplayMetadataToJob(rawJob)
              const score = getDisplayScore(job.outputResult)
              return (
                <Link key={job.id} href={`/dashboard/clinical-pathway/${job.id}`} className="block p-4 transition-colors hover:bg-surface-elevated/50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-text">{getPatientName(job.inputPayload)}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${getStatusTone(job.status)}`}>{job.status}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-text-subtle">{getDiagnosis(job.inputPayload, job.outputResult)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-text">{score !== null ? `${Math.round(score)}/100` : '-'}</p>
                        <p className="text-xs text-text-faint">{formatDate(job.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold text-text">Kesiapan tim</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{teamUsers}</p>
          <p className="mt-1 text-sm text-text-subtle">User terdaftar dalam ruang kerja ini.</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold text-text">Kredensial integrasi</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-secondary">{activeApiKeys}</p>
          <p className="mt-1 text-sm text-text-subtle">Kunci aktif untuk integrasi API client.</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold text-text">Catatan layanan</p>
          <p className="mt-2 text-sm leading-6 text-text-subtle">Estimasi pemakaian bersifat operasional dan dapat berubah mengikuti volume workflow serta kompleksitas data klaim.</p>
        </div>
      </section>
    </div>
  )
}
