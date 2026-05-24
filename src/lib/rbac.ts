import prisma from '@/lib/db'
import { getSession } from '@/lib/auth'

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER', 'VIEWER'] as const
export const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const
export const CONFIG_ACCESS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CLIENT_ADMIN'] as const

export type UserRole = (typeof ROLES)[number]
export type Permission =
  | 'AI_ENGINE_CONFIG'
  | 'AI_USAGE_LOGS'
  | 'CLIENT_API_KEYS'
  | 'USER_MANAGEMENT'
  | 'CLINICAL_THRESHOLDS'
  | 'PATHWAY_LIMITS'

export type AuthenticatedUser = {
  id: string
  email: string
  name: string | null
  role: string
  clientId: string | null
}

export function isPlatformAdminRole(role: unknown): boolean {
  return typeof role === 'string' && PLATFORM_ADMIN_ROLES.includes(role as (typeof PLATFORM_ADMIN_ROLES)[number])
}

export function isSuperAdminRole(role: unknown): boolean {
  return role === 'SUPER_ADMIN'
}

export function canAccessConfig(role: unknown): boolean {
  return typeof role === 'string' && CONFIG_ACCESS_ROLES.includes(role as (typeof CONFIG_ACCESS_ROLES)[number])
}

export function hasPermission(role: unknown, permission: Permission): boolean {
  if (role === 'SUPER_ADMIN') return true

  switch (permission) {
    case 'AI_ENGINE_CONFIG':
    case 'AI_USAGE_LOGS':
      return false
    case 'CLIENT_API_KEYS':
    case 'USER_MANAGEMENT':
    case 'CLINICAL_THRESHOLDS':
      return role === 'ADMIN' || role === 'CLIENT_ADMIN'
    case 'PATHWAY_LIMITS':
      return role === 'ADMIN'
    default:
      return false
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await getSession()
  const userId = typeof session?.userId === 'string' ? session.userId : null
  const email = typeof session?.email === 'string' ? session.email : null

  if (!userId && !email) return null

  return prisma.user.findFirst({
    where: userId ? { id: userId } : { email: email ?? undefined },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clientId: true,
    },
  })
}

export async function getIsCurrentUserAdmin(): Promise<boolean> {
  const user = await getAuthenticatedUser()
  return isPlatformAdminRole(user?.role)
}

export async function getCurrentUserPermission(permission: Permission): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser()
  if (!user || !hasPermission(user.role, permission)) return null
  return user
}
