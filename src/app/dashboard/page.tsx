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

function getScore(outputResult: unknown): number | null {
  const output = asRecord(outputResult)
  return numberValue(output?.overallScore) ?? numberValue(output?.score) ?? numberValue(asRecord(output?.scoreBreakdown)?.totalScore)
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

export default async function DashboardPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const isPlatformAdmin = isPlatformAdminRole(user.role)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 6)
  weekStart.setHours(0, 0, 0, 0)

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
  const scores = monthJobs.map((job) => getScore(job.outputResult)).filter((score): score is number => score !== null)
  const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
  const totalTokens = aiUsageLogs.reduce((sum, log) => sum + log.totalTokens, 0)
  const serviceUsageCost = aiUsageLogs.reduce((sum, log) => sum + estimateServiceCostIdr(log), 0)

  const dailyRuns = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    const nextDate = new Date(date)
    nextDate.setDate(date.getDate() + 1)
    const count = monthJobs.filter((job) => job.createdAt >= date && job.createdAt < nextDate).length
    return { label: new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date), count }
  })
  const maxDailyRuns = Math.max(1, ...dailyRuns.map((item) => item.count))

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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-text">Tren 7 hari</h2>
              <p className="mt-1 text-sm text-text-subtle">Jumlah workflow validasi yang masuk.</p>
            </div>
            <span className="rounded-full bg-secondary-soft px-3 py-1 text-xs font-semibold text-secondary ring-1 ring-secondary/20">Mingguan</span>
          </div>
          <div className="mt-6 flex h-44 items-end gap-2" aria-label="Grafik workflow tujuh hari terakhir">
            {dailyRuns.map((item) => (
              <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end rounded-full bg-surface-elevated/70 p-1">
                  <div className="w-full rounded-full bg-primary transition-all" style={{ height: `${Math.max(8, (item.count / maxDailyRuns) * 100)}%` }} />
                </div>
                <p className="text-[11px] font-medium text-text-subtle">{item.label}</p>
                <p className="text-xs font-bold tabular-nums text-text">{item.count}</p>
              </div>
            ))}
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
              const score = getScore(job.outputResult)
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
