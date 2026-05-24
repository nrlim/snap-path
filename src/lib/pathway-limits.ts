import prisma from '@/lib/db'
import type { AuthenticatedUser } from '@/lib/rbac'

export const PATHWAY_LIMIT_WINDOW_LABEL = 'hari ini'

export type PathwayLimitSettings = {
  VIEWER: number
  CLIENT_USER: number
  CLIENT_ADMIN: number
  ADMIN: number
  SUPER_ADMIN: number
}

export const DEFAULT_PATHWAY_LIMITS: PathwayLimitSettings = {
  VIEWER: 3,
  CLIENT_USER: 10,
  CLIENT_ADMIN: 25,
  ADMIN: 0,
  SUPER_ADMIN: 0,
}

export function normalizeLimit(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

export async function getPathwayLimitSettings(): Promise<PathwayLimitSettings> {
  const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL_CONFIG' } })

  return {
    VIEWER: normalizeLimit(config?.pathwayDailyLimitViewer, DEFAULT_PATHWAY_LIMITS.VIEWER),
    CLIENT_USER: normalizeLimit(config?.pathwayDailyLimitClientUser, DEFAULT_PATHWAY_LIMITS.CLIENT_USER),
    CLIENT_ADMIN: normalizeLimit(config?.pathwayDailyLimitClientAdmin, DEFAULT_PATHWAY_LIMITS.CLIENT_ADMIN),
    ADMIN: normalizeLimit(config?.pathwayDailyLimitAdmin, DEFAULT_PATHWAY_LIMITS.ADMIN),
    SUPER_ADMIN: normalizeLimit(config?.pathwayDailyLimitSuperAdmin, DEFAULT_PATHWAY_LIMITS.SUPER_ADMIN),
  }
}

export function getPathwayLimitForRole(settings: PathwayLimitSettings, role: string): number {
  if (role === 'SUPER_ADMIN') return settings.SUPER_ADMIN
  if (role === 'ADMIN') return settings.ADMIN
  if (role === 'CLIENT_ADMIN') return settings.CLIENT_ADMIN
  if (role === 'CLIENT_USER') return settings.CLIENT_USER
  return settings.VIEWER
}

export function getTodayRange(): { start: Date; end: Date } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export async function countTodayPathwayRequests(userId: string): Promise<number> {
  const { start, end } = getTodayRange()
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "ClaimJob"
    WHERE "jobType" = 'CLAIM_VALIDATION'
      AND "createdAt" >= ${start}
      AND "createdAt" < ${end}
      AND "inputPayload"->>'requestedByUserId' = ${userId}
  `

  return Number(rows[0]?.count ?? 0)
}

export async function getPathwayUsageForUser(user: AuthenticatedUser): Promise<{
  limit: number
  used: number
  remaining: number | null
}> {
  const settings = await getPathwayLimitSettings()
  const limit = getPathwayLimitForRole(settings, user.role)
  const used = await countTodayPathwayRequests(user.id)

  return {
    limit,
    used,
    remaining: limit === 0 ? null : Math.max(limit - used, 0),
  }
}
