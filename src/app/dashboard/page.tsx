import Link from 'next/link'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { applyClaimDisplayMetadataToJob } from '@/lib/claim-display'
import { getAuthenticatedUser, isPlatformAdminRole, isSuperAdminRole } from '@/lib/rbac'

const DEFAULT_PRICING = { inputPerMillion: 0.15, outputPerMillion: 0.6 }
const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
}

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

function estimateServiceCostUsd(log: { aiModel: string | null; inputTokens: number; outputTokens: number }) {
  const pricing = getPricing(log.aiModel)
  return ((log.inputTokens / 1_000_000) * pricing.inputPerMillion) + ((log.outputTokens / 1_000_000) * pricing.outputPerMillion)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(Math.round(value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value)
}

function formatCredit(value: number) {
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)}`
}

function formatRequestQuota(value: number) {
  return `${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.floor(value)))} request`
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

  const findings = getDiagnosisFindingCounts(outputResult)
  const hasDiagnosisFindings = findings.missing > 0 || findings.relevance > 0 || findings.medication > 0

  return items.reduce((total, rawItem) => {
    const item = asRecord(rawItem)
    const maxScore = numberValue(item?.maxScore) ?? numberValue(item?.maxDeduction) ?? 0
    const deducted = numberValue(item?.deducted) ?? 0
    const isDiagnosisItem = item?.code === 'DIAGNOSIS_TREATMENT' || item?.label === 'Diagnosis, tindakan & obat klinis'
    const shouldClearHiddenDiagnosisDeduction = isDiagnosisItem && deducted > 0 && !hasDiagnosisFindings
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
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    case 'FAILED':
      return 'bg-red-50 text-red-700 ring-red-600/20'
    case 'PROCESSING':
    case 'PRE_PROCESSING':
    case 'POST_PROCESSING':
      return 'bg-indigo-50 text-indigo-700 ring-indigo-600/20'
    default:
      return 'bg-amber-50 text-amber-700 ring-amber-600/20'
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
  const isSuperAdmin = isSuperAdminRole(user.role)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const trendStart = new Date(now)
  trendStart.setDate(now.getDate() - (trendDays - 1))
  trendStart.setHours(0, 0, 0, 0)

  const scopedClientWhere = isPlatformAdmin ? {} : { clientId: user.clientId || '__none__' }
  const [
    monthJobs,
    recentJobs,
    trendJobs,
    aiUsageLogs,
    creditClients,
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
    prisma.client.findMany({
      where: isPlatformAdmin ? undefined : { id: user.clientId || '__none__' },
      select: { creditBalance: true, requestBalance: true },
    }),
    prisma.apiKey.count({ where: { ...scopedClientWhere, isActive: true } }),
    prisma.user.count({ where: scopedClientWhere }),
  ])

  const completedJobs = monthJobs.filter((job) => job.status === 'COMPLETED').length
  const failedJobs = monthJobs.filter((job) => job.status === 'FAILED').length
  const inProgressJobs = monthJobs.filter((job) => !['COMPLETED', 'FAILED'].includes(job.status)).length
  const scores = monthJobs.map((job) => getDisplayScore(job.outputResult)).filter((score): score is number => score !== null)
  const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
  const totalTokens = aiUsageLogs.reduce((sum, log) => sum + log.totalTokens, 0)
  const serviceUsageCostUsd = aiUsageLogs.reduce((sum, log) => sum + estimateServiceCostUsd(log), 0)
  const serviceUsageCostIdr = serviceUsageCostUsd * USD_TO_IDR
  const creditBalance = creditClients.reduce((sum, client) => sum + client.creditBalance, 0)
  const requestBalance = creditClients.reduce((sum, client) => sum + client.requestBalance, 0)

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
  const trendTotal = trendPoints.reduce((sum, item) => sum + item.count, 0)

  const summaryCards = [
    { label: 'Validasi bulan ini', value: formatNumber(monthJobs.length), helper: `${completedJobs} selesai, ${inProgressJobs} berjalan`, tone: 'text-foreground' },
    { label: 'Skor rata-rata', value: scores.length ? `${Math.round(averageScore)}/100` : 'Belum ada', helper: 'Rata-rata hasil validasi klaim', tone: 'text-foreground' },
    { label: 'Kuota request tersedia', value: isSuperAdmin ? '∞' : formatRequestQuota(requestBalance), helper: isSuperAdmin ? 'Super admin tidak dibatasi kuota request' : 'Berkurang 1 setiap request validasi', tone: 'text-foreground' },
    ...(isPlatformAdmin ? [
      { label: 'Estimasi pemakaian layanan', value: `${formatUsd(serviceUsageCostUsd)} / ${formatCurrency(serviceUsageCostIdr)}`, helper: `${formatNumber(totalTokens)} unit pemrosesan`, tone: 'text-foreground' },
      { label: 'Credit tersedia', value: formatCredit(creditBalance), helper: `Berkurang sesuai estimasi pemakaian AI`, tone: 'text-foreground' },
    ] : []),
  ]

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Dashboard Operasional</p>
            <h1 className="mt-4 max-w-3xl text-2xl font-light tracking-tight text-foreground sm:text-3xl">
              Ringkasan validasi klaim dan <span className="font-medium text-primary">kesiapan data bulan ini.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground font-light">
              Pantau volume workflow, kualitas hasil validasi, kuota request, dan kesiapan master data tanpa menampilkan detail teknis engine internal.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard/clinical-pathway" className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none">
                Buka Clinical Pathway
              </Link>
              <Link href="/dashboard/master-data/buku-tarif" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none">
                Cek Master Data
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-5">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4 mb-4">
              <div>
                <p className="text-sm font-medium text-foreground">Status bulan berjalan</p>
                <p className="mt-1 text-xs text-muted-foreground font-light">Periode {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(now)}</p>
              </div>
              <span className="rounded-sm bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 uppercase tracking-widest">Aktif</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-light tabular-nums text-foreground">{completedJobs}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">Selesai</p>
              </div>
              <div>
                <p className="text-2xl font-light tabular-nums text-foreground">{inProgressJobs}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">Berjalan</p>
              </div>
              <div>
                <p className="text-2xl font-light tabular-nums text-foreground">{failedJobs}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">Gagal</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{card.label}</p>
            <p className={`mt-3 text-3xl font-light tabular-nums ${card.tone}`}>{card.value}</p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground font-light pt-3 border-t border-border/50">{card.helper}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-medium text-foreground">Tren Workflow</h2>
              <p className="mt-1 text-sm text-muted-foreground font-light">{trendTotal} validasi dalam {trendMode === 'monthly' ? '30 hari terakhir' : '7 hari terakhir'}.</p>
            </div>
            <div className="inline-flex rounded-md border border-border bg-background p-1">
              <Link href="/dashboard?trend=weekly" className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${trendMode === 'weekly' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Mingguan</Link>
              <Link href="/dashboard?trend=monthly" className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${trendMode === 'monthly' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Bulanan</Link>
            </div>
          </div>
          
          <div className="mt-6 flex-1 rounded-xl border border-border bg-background p-5" aria-label={`Grafik workflow ${trendMode === 'monthly' ? 'bulanan' : 'mingguan'}`}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full overflow-visible" role="img" aria-label="Line chart jumlah workflow validasi">
              {/* Horizontal Grid lines */}
              {[0, 1, 2, 3].map((line) => {
                const y = chartPadding + (line * ((chartHeight - chartPadding * 2) / 3))
                return <line key={line} x1={chartPadding} x2={chartWidth - chartPadding} y1={y} y2={y} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="2 4" />
              })}
              
              {/* Line and dots */}
              {chartLinePoints && <polyline points={chartLinePoints} fill="none" stroke="var(--color-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              {chartCoordinates.map((item, index) => (
                <g key={`${item.label}-${index}`}>
                  {/* Vertical line connecting dot to bottom */}
                  <line x1={item.x} y1={chartHeight - chartPadding} x2={item.x} y2={item.y} stroke="var(--color-border)" strokeWidth="1" />
                  {/* The dot */}
                  <circle cx={item.x} cy={item.y} r="3.5" fill="var(--color-card)" stroke="var(--color-foreground)" strokeWidth="2" />
                  
                  {/* X-Axis labels */}
                  {(trendMode === 'weekly' || index === 0 || index === chartCoordinates.length - 1 || index % 7 === 0) && (
                    <text x={item.x} y={chartHeight + 8} textAnchor="middle" className="fill-[var(--color-muted-foreground)] text-[10px] font-mono">{item.label}</text>
                  )}
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-background p-3 border border-border">
              <p className="text-[10px] font-mono uppercase text-muted-foreground">Total</p>
              <p className="mt-1.5 text-xl font-medium tabular-nums text-foreground">{trendTotal}</p>
            </div>
            <div className="rounded-lg bg-background p-3 border border-border">
              <p className="text-[10px] font-mono uppercase text-muted-foreground">Tertinggi</p>
              <p className="mt-1.5 text-xl font-medium tabular-nums text-foreground">{maxTrendCount}</p>
            </div>
            <div className="rounded-lg bg-background p-3 border border-border">
              <p className="text-[10px] font-mono uppercase text-muted-foreground">Rata-rata</p>
              <p className="mt-1.5 text-xl font-medium tabular-nums text-foreground">{(trendTotal / trendDays).toFixed(1)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border p-6">
            <div>
              <h2 className="text-lg font-medium text-foreground">Aktivitas Terbaru</h2>
              <p className="mt-1 text-sm text-muted-foreground font-light">Ringkasan klaim terakhir yang diproses.</p>
            </div>
            <Link href="/dashboard/clinical-pathway" className="text-sm font-medium text-foreground hover:underline">Lihat semua →</Link>
          </div>
          <div className="divide-y divide-border">
            {recentJobs.length === 0 ? (
              <div className="p-8 text-center flex-1 flex flex-col justify-center">
                <p className="text-sm font-medium text-foreground">Belum ada aktivitas</p>
                <p className="mt-1 text-sm text-muted-foreground font-light">Mulai validasi klaim untuk melihat histori workflow di sini.</p>
              </div>
            ) : recentJobs.map((rawJob) => {
              const job = applyClaimDisplayMetadataToJob(rawJob)
              const score = getDisplayScore(job.outputResult)
              return (
                <Link key={job.id} href={`/dashboard/clinical-pathway/${job.id}`} className="block p-5 transition-colors hover:bg-muted group">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">{getPatientName(job.inputPayload)}</p>
                        <span className={`rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] ring-1 ${getStatusTone(job.status)}`}>{job.status}</span>
                      </div>
                      <p className="mt-2 truncate text-sm text-muted-foreground font-mono">{getDiagnosis(job.inputPayload, job.outputResult)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right">
                        <p className="text-lg font-light tabular-nums text-foreground">{score !== null ? `${Math.round(score)}/100` : '-'}</p>
                        <p className="mt-1 text-xs text-muted-foreground font-mono">{formatDate(job.createdAt)}</p>
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
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">Kesiapan Tim</p>
          <p className="mt-3 text-3xl font-light tabular-nums text-foreground">{teamUsers}</p>
          <p className="mt-2 text-sm text-muted-foreground font-light pt-3 border-t border-border/50">User terdaftar dalam ruang kerja ini.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">Kredensial Integrasi</p>
          <p className="mt-3 text-3xl font-light tabular-nums text-foreground">{activeApiKeys}</p>
          <p className="mt-2 text-sm text-muted-foreground font-light pt-3 border-t border-border/50">Kunci aktif untuk integrasi API client.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">Catatan Layanan</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground font-light">Estimasi pemakaian bersifat operasional dan dapat berubah mengikuti volume workflow serta kompleksitas data klaim yang dikirimkan ke mesin AI.</p>
        </div>
      </section>
    </div>
  )
}
